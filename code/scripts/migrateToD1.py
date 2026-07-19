#!/usr/bin/env python3
"""
One-off migration: Postgres SQL dump -> Cloudflare D1.
Uses literal multi-statement INSERT SQL (bypasses D1's 100-param limit),
batched by body size (~800KB/request).
"""

import os
import json
import urllib.request
import urllib.error
import time
import csv
import io
import re

DUMP_PATH = os.environ.get("DUMP_PATH", "db-backups/data-dump-17-06-25.sql")
ENV_PATH = os.environ.get("ENV_PATH", ".env.local")
MAX_BODY = 600000  # stay safely under D1's 1MB JSON body limit


def load_env(path):
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


env = load_env(ENV_PATH)
ACCOUNT_ID = env["CLOUDFLARE_ACCOUNT_ID"]
DB_ID = env["CLOUDFLARE_DB_ID"]
API_TOKEN = env["CLOUDFLARE_API_TOKEN"]
D1_URL = (
    f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}"
    f"/d1/database/{DB_ID}/query"
)


def d1_query(sql):
    body = json.dumps({"sql": sql}).encode("utf-8")
    if len(body) > 1000000:
        raise RuntimeError(f"Body too large: {len(body)} bytes")
    for attempt in range(6):
        try:
            req = urllib.request.Request(
                D1_URL,
                data=body,
                headers={
                    "Authorization": f"Bearer {API_TOKEN}",
                    "Content-Type": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read())
            if not data.get("success"):
                errs = data.get("errors", [])
                raise RuntimeError(f"D1 error: {errs}")
            return data
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < 5:
                wait = 2 ** (attempt + 1)
                print(f"    transient error ({e.code}), retry in {wait}s...")
                time.sleep(wait)
                continue
            body_text = e.read().decode("utf-8", errors="replace")[:300]
            raise RuntimeError(f"HTTP {e.code}: {body_text}") from e


def sql_escape(val):
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "1" if val else "0"
    if isinstance(val, (int, float)):
        return str(val)
    escaped = val.replace("'", "''")
    return "'" + escaped + "'"


def unescape(s):
    if s == "\\N":
        return None
    return (
        s.replace("\\\\", "\x00")
        .replace("\\t", "\t")
        .replace("\\n", "\n")
        .replace("\\r", "\r")
        .replace("\x00", "\\")
    )


def parse_pg_array(s):
    if not s or s == "\\N":
        return None
    inner = s[1:-1]
    reader = csv.reader(io.StringIO(inner), quotechar=chr(34), skipinitialspace=True)
    return next(reader)


def build_row_statement(table, columns, values):
    vals = ", ".join(sql_escape(v) for v in values)
    return f"INSERT OR REPLACE INTO {table} VALUES ({vals});"


def batch_insert_by_size(table, columns, raw_rows, transform):
    """Insert using literal SQL, batching by accumulated body size."""
    total = len(raw_rows)
    inserted = 0
    batch_sql = ""
    batch_count = 0
    requests = 0

    for i, raw in enumerate(raw_rows):
        values = transform(raw)
        stmt = build_row_statement(table, columns, values)
        if len(batch_sql) + len(stmt) > MAX_BODY and batch_count > 0:
            d1_query(batch_sql)
            requests += 1
            inserted += batch_count
            time.sleep(0.15)
            if requests % 5 == 0 or inserted % 1000 < batch_count:
                print(f"    {table}: {inserted}/{total} ({requests} requests)")
            batch_sql = ""
            batch_count = 0
        batch_sql += stmt
        batch_count += 1

    if batch_count > 0:
        d1_query(batch_sql)
        requests += 1
        inserted += batch_count

    print(f"    {table}: {inserted}/{total} DONE ({requests} requests)")
    return inserted


def parse_dump_tables(path):
    tables = {}
    current_table = None
    current_rows = None
    copy_re = re.compile(r"COPY public\.(\w+) \(([^)]+)\) FROM stdin;")
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("COPY public."):
                m = copy_re.match(line)
                if m:
                    current_table = m.group(1)
                    current_rows = []
                    tables[current_table] = current_rows
                continue
            if line.startswith("\\."):
                current_table = None
                current_rows = None
                continue
            if current_table is not None:
                current_rows.append(line.rstrip("\n"))
    return tables


def main():
    max_rows = int(os.environ.get("MIGRATE_LIMIT", "0"))
    print("=== Migration script starting ===")
    t0 = time.time()

    print("Parsing SQL dump...")
    tables = parse_dump_tables(DUMP_PATH)
    for name, rows in tables.items():
        print(f"  {name}: {len(rows)} rows")

    if "views" in tables:
        rows = tables["views"][:max_rows] if max_rows else tables["views"]

        def tf_view(r):
            p = r.split("\t")
            return [unescape(p[0]), unescape(p[1]), unescape(p[2]),
                    unescape(p[3]), unescape(p[4]), None]  # audio=NULL

        print("\n--- views ---")
        batch_insert_by_size("views", None, rows, tf_view)

    if "links" in tables:
        rows = tables["links"][:max_rows] if max_rows else tables["links"]

        def tf_link(r):
            p = r.split("\t")
            return [unescape(p[0]), unescape(p[1]), unescape(p[2])]

        print("\n--- links ---")
        batch_insert_by_size("links", None, rows, tf_link)

    if "breakdowns" in tables:
        rows = tables["breakdowns"][:max_rows] if max_rows else tables["breakdowns"]

        def tf_bd(r):
            p = r.split("\t")
            return [unescape(p[0]), unescape(p[1]), unescape(p[2]), unescape(p[3])]

        print("\n--- breakdowns ---")
        batch_insert_by_size("breakdowns", None, rows, tf_bd)

    if "edges" in tables:
        rows = tables["edges"][:max_rows] if max_rows else tables["edges"]

        def tf_edge(r):
            p = r.split("\t")
            tags_raw = unescape(p[6]) if len(p) > 6 else None
            tags_list = parse_pg_array(tags_raw)
            tags_json = json.dumps(tags_list) if tags_list is not None else None
            return [unescape(p[0]), unescape(p[1]), unescape(p[2]), unescape(p[3]),
                    float(unescape(p[4])), unescape(p[5]), tags_json]

        print("\n--- edges ---")
        batch_insert_by_size("edges", None, rows, tf_edge)

    elapsed = time.time() - t0
    print(f"\n=== Migration complete in {elapsed:.1f}s ===")


if __name__ == "__main__":
    main()

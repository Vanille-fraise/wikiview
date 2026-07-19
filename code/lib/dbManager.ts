import { View } from "@/code/types/view";
import { randomUUID } from "crypto";

const MAX_LITERAL_BODY = 600000;

function getD1Url(): string {
  return `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${process.env.CLOUDFLARE_DB_ID}/query`;
}

interface D1StatementResult {
  results: Record<string, unknown>[];
  success: boolean;
  meta: Record<string, unknown>;
}

export async function d1Query(sql: string, params?: unknown[]): Promise<D1StatementResult[]> {
  const body: Record<string, unknown> = { sql };
  if (params && params.length > 0) body.params = params;
  const resp = await fetch(getD1Url(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!data.success) {
    throw new Error(`D1 error: ${JSON.stringify(data.errors)}`);
  }
  return data.result as D1StatementResult[];
}

function sqlEscape(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "1" : "0";
  return "'" + String(val).replace(/'/g, "''") + "'";
}

function buildInsertSQL(table: string, rows: unknown[][]): string {
  return rows
    .map((r) => `INSERT OR REPLACE INTO ${table} VALUES (${r.map(sqlEscape).join(", ")});`)
    .join(" ");
}

async function d1BatchLiteral(sql: string): Promise<void> {
  if (sql.length <= MAX_LITERAL_BODY) {
    await d1Query(sql);
    return;
  }
  const stmts = sql.match(/INSERT[^;]+;/g) || [];
  let chunk = "";
  for (const stmt of stmts) {
    if (chunk.length + stmt.length > MAX_LITERAL_BODY && chunk.length > 0) {
      await d1Query(chunk);
      chunk = "";
    }
    chunk += stmt + " ";
  }
  if (chunk.trim()) await d1Query(chunk);
}

export async function initDb() {
  console.log("Initializing D1 database...");
  await d1Query(`
    CREATE TABLE IF NOT EXISTS views (
      id TEXT PRIMARY KEY,
      pageName TEXT NOT NULL UNIQUE COLLATE NOCASE,
      summary TEXT,
      descImg TEXT,
      pageVect TEXT,
      audio TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_views_pagename_ci ON views(pageName COLLATE NOCASE);
    CREATE TABLE IF NOT EXISTS links (
      id TEXT PRIMARY KEY,
      view_id TEXT NOT NULL,
      pageName TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS breakdowns (
      id TEXT PRIMARY KEY,
      view_id TEXT NOT NULL,
      sentence TEXT NOT NULL,
      vect TEXT
    );
    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      view_id TEXT NOT NULL,
      originPageId TEXT NOT NULL,
      destPageName TEXT NOT NULL,
      relevance REAL NOT NULL,
      linkType TEXT NOT NULL CHECK(linkType IN ('hyper','breakDown','hybrid')),
      tags TEXT
    );
  `);
  console.log("D1 database initialization complete.");
}

export async function getViewByPageName(pageName: string): Promise<View | null> {
  try {
    const viewRes = await d1Query(
      "SELECT id, pageName, summary, descImg, pageVect, audio FROM views WHERE pageName = ? COLLATE NOCASE",
      [pageName]
    );
    if (!viewRes[0].results || viewRes[0].results.length === 0) {
      return null;
    }
    const v = viewRes[0].results[0] as Record<string, string>;
    const viewId = v.id as string;

    const escapedId = sqlEscape(viewId);
    const childRes = await d1Query(`
      SELECT id, pageName FROM links WHERE view_id = ${escapedId};
      SELECT id, sentence, vect FROM breakdowns WHERE view_id = ${escapedId};
      SELECT originPageId, destPageName, relevance, linkType, tags FROM edges WHERE view_id = ${escapedId};
    `);

    const linkRows = childRes[0].results as Record<string, string>[];
    const bdRows = childRes[1].results as Record<string, string>[];
    const edgeRows = childRes[2].results as Record<string, unknown>[];

    const fullView: View = {
      id: viewId,
      pageName: v.pageName as string,
      summary: v.summary as string,
      descImg: v.descImg as string,
      pageVect: JSON.parse((v.pageVect as string) || "[]"),
      audio: (v.audio as string) || null,
      links: linkRows.map((r) => ({
        id: r.id as string,
        destPageName: r.pageName as string,
      })),
      breakDowns: bdRows.map((r) => ({
        id: r.id as string,
        sentence: r.sentence as string,
        vect: JSON.parse((r.vect as string) || "[]"),
      })),
      edges: edgeRows.map((r) => ({
        originPageId: r.originPageId as string,
        destPageName: r.destPageName as string,
        relevance: r.relevance as number,
        linkType: r.linkType as "hyper" | "breakDown" | "hybrid",
        tags: r.tags ? JSON.parse(r.tags as string) : [],
      })),
    };

    return fullView;
  } catch (err) {
    console.error(`Error fetching view by name "${pageName}":`, err);
    throw err;
  }
}

let pageVectCache: { pageName: string; vect: number[] }[] | null = null;

async function getAllPageVects(): Promise<{ pageName: string; vect: number[] }[]> {
  if (pageVectCache) return pageVectCache;
  const res = await d1Query(
    "SELECT pageName, pageVect FROM views WHERE pageVect IS NOT NULL"
  );
  pageVectCache = (res[0].results as Record<string, string>[]).map((r) => ({
    pageName: r.pageName as string,
    vect: JSON.parse((r.pageVect as string) || "[]") as number[],
  }));
  return pageVectCache;
}

export function invalidatePageVectCache(): void {
  pageVectCache = null;
}

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}

export async function getSimilarPageNames(
  vect: number[],
  limit: number,
  proximityThreshold: number = 0
): Promise<string[]> {
  try {
    const allVects = await getAllPageVects();
    const distanceThreshold = 1 - proximityThreshold;

    return allVects
      .filter((entry) => entry.vect.length === vect.length)
      .map((entry) => ({
        pageName: entry.pageName,
        dist: cosineDistance(vect, entry.vect),
      }))
      .filter((entry) => entry.dist <= distanceThreshold)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, limit)
      .map((entry) => entry.pageName)
      .filter((n) => n);
  } catch (err) {
    console.error("Error getting similar views:", err);
    return [];
  }
}

export async function addOrUpdateView(view: View): Promise<void> {
  try {
    const pageVectString =
      view.pageVect && view.pageVect.length > 0
        ? JSON.stringify(view.pageVect)
        : null;

    await d1Query(
      `INSERT OR REPLACE INTO views (id, pageName, summary, descImg, pageVect, audio) VALUES (${sqlEscape(view.id)}, ${sqlEscape(view.pageName)}, ${sqlEscape(view.summary)}, ${sqlEscape(view.descImg)}, ${sqlEscape(pageVectString)}, ${sqlEscape(view.audio)});`
    );

    const escapedViewId = sqlEscape(view.id);
    await d1Query(`DELETE FROM links WHERE view_id = ${escapedViewId}; DELETE FROM breakdowns WHERE view_id = ${escapedViewId}; DELETE FROM edges WHERE view_id = ${escapedViewId};`);

    if (view.links && view.links.length > 0) {
      const linkRows = view.links.map((l) => [l.id, view.id, l.destPageName]);
      await d1BatchLiteral(buildInsertSQL("links", linkRows));
    }

    if (view.breakDowns && view.breakDowns.length > 0) {
      const bdRows = view.breakDowns.map((bd) => [
        bd.id,
        view.id,
        bd.sentence,
        bd.vect.length > 0 ? JSON.stringify(bd.vect) : null,
      ]);
      await d1BatchLiteral(buildInsertSQL("breakdowns", bdRows));
    }

    if (view.edges && view.edges.length > 0) {
      const edgeRows = view.edges.map((edge) => [
        randomUUID(),
        view.id,
        edge.originPageId,
        edge.destPageName,
        edge.relevance,
        edge.linkType,
        edge.tags && edge.tags.length > 0 ? JSON.stringify(edge.tags) : null,
      ]);
      await d1BatchLiteral(buildInsertSQL("edges", edgeRows));
    }

    invalidatePageVectCache();
    console.log("Saved view " + view.pageName);
  } catch (err) {
    console.error(
      `Error in addOrUpdateView for page ${view.pageName} id "${view.id}".`,
      err
    );
    throw err;
  }
}

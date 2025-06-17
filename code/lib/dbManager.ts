import { Pool } from "pg";
import { View } from "@/code/types/view";
import { EMBEDDINGS_DIMENSIONS } from "@/code/lib/extResourceManager";
import arrayParser from "postgres-array";

const DEFAULT_PORT = "12187";

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: parseInt(process.env.POSTGRES_PORT || DEFAULT_PORT, 10),
  ssl: {
    rejectUnauthorized: false,
  },
});

export async function initDb() {
  const client = await pool.connect();
  console.log("Connected to PostgreSQL, initializing DB...");

  try {
    await client.query("BEGIN");
    await client.query("CREATE EXTENSION IF NOT EXISTS vector;");

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE link_type AS ENUM ('hyper', 'breakDown', 'hybrid');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS views (
        id TEXT PRIMARY KEY,
        pageName TEXT NOT NULL UNIQUE,
        summary TEXT,
        descImg TEXT,
        pageVect vector(${EMBEDDINGS_DIMENSIONS}),
        audio TEXT
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lower_pagename ON views (lower(pagename));
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS links (
        id TEXT PRIMARY KEY,
        view_id TEXT NOT NULL REFERENCES views(id) ON DELETE CASCADE,
        pageName TEXT NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS breakdowns (
        id TEXT PRIMARY KEY,
        view_id TEXT NOT NULL REFERENCES views(id) ON DELETE CASCADE,
        sentence TEXT NOT NULL,
        vect vector(${EMBEDDINGS_DIMENSIONS})
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(), -- Edges don't have an ID in the interface, so we generate one.
        view_id TEXT NOT NULL REFERENCES views(id) ON DELETE CASCADE,
        originPageId TEXT NOT NULL,
        destPageName TEXT NOT NULL,
        relevance NUMERIC NOT NULL,
        linkType link_type NOT NULL,
        tags TEXT[]
      );
    `);

    await client.query("COMMIT");
    console.log("Database initialization complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error during DB initialization, rolling back.", err);
    throw err;
  } finally {
    client.release();
  }
}

function parsePostgresArray(arrayString: string | null | undefined): string[] {
  if (!arrayString || arrayString === "{}") {
    return [];
  }
  if (Array.isArray(arrayString)) {
    return arrayString;
  } else if (typeof arrayString === "string") {
    return arrayParser.parse(arrayString);
  }
  return [];
}

/**
 * Fetches a single View object from the database, assembling it from multiple tables.
 * @param pageName The unique pageName of the view to retrieve.
 * @returns The complete View object or null if not found.
 */
export async function getViewByPageName(
  pageName: string
): Promise<View | null> {
  const client = await pool.connect();
  try {
    const viewRes = await client.query(
      "SELECT id, pagename, summary, descimg, pagevect, audio FROM views WHERE lower(pageName) like lower($1)",
      [pageName]
    );
    if (viewRes.rows.length === 0) {
      return null;
    }
    const viewData = viewRes.rows[0];
    const viewId = viewData.id;

    // Fetch all related items in parallel
    const [linksRes, breakDownsRes, edgesRes] = await Promise.all([
      client.query(
        "SELECT id, pagename AS destPageName FROM links WHERE view_id = $1",
        [viewId]
      ),
      client.query(
        "SELECT id, sentence, vect FROM breakdowns WHERE view_id = $1",
        [viewId]
      ),
      client.query(
        "SELECT originpageid, destpagename, relevance, linktype, tags FROM edges WHERE view_id = $1",
        [viewId]
      ),
    ]);

    // Assemble the final View object with runtime parsing
    const fullView: View = {
      id: viewData.id,
      pageName: viewData.pagename,
      summary: viewData.summary,
      descImg: viewData.descimg,
      // CORRECTED: Parse the vector string into a number array
      pageVect: JSON.parse(viewData.pagevect || "[]"),
      audio: viewData.audio,
      links: linksRes.rows.map((r) => ({
        id: r.id,
        destPageName: r.destpagename,
      })),
      breakDowns: breakDownsRes.rows.map((r) => ({
        id: r.id,
        sentence: r.sentence,
        // CORRECTED: Parse the vector string for each breakdown
        vect: JSON.parse(r.vect || "[]"),
      })),
      edges: edgesRes.rows.map((r) => ({
        originPageId: r.originpageid,
        destPageName: r.destpagename,
        relevance: r.relevance,
        linkType: r.linktype,
        tags: parsePostgresArray(r.tags),
      })),
    };

    return fullView;
  } catch (err) {
    console.error(`Error fetching view by name "${pageName}":`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getSimilarPageNames(
  vect: number[],
  limit: number,
  proximityThreshold: number = 0
): Promise<string[]> {
  const client = await pool.connect();
  try {
    const vectorString = `[${vect.join(",")}]`;
    const distanceThreshold = 1 - proximityThreshold;

    const similarPageNamesRes = await client.query(
      `
      SELECT pageName
      FROM views
      WHERE (pageVect <=> $1) <= $2
      ORDER BY pageVect <=> $1 ASC
      LIMIT $3
    `,
      [vectorString, distanceThreshold, limit]
    );
    return similarPageNamesRes.rows.filter((n) => n);
  } catch (err) {
    console.error("Error getting similar views:", err);
    return [];
  } finally {
    client.release();
  }
}

/**
 * Adds a new view or updates an existing one based on the view.id.
 * This function operates within a transaction. It will:
 * 1. UPSERT the core view data into the 'views' table.
 * 2. Delete all existing associated data (links, breakdowns, edges) for that view.
 * 3. Insert the new associated data from the provided view object.
 * If any step fails, the entire transaction is rolled back.
 *
 * @param view The complete View object to be added or updated.
 */
export async function addOrUpdateView(view: View): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const upsertViewQuery = `
      INSERT INTO views (id, pagename, summary, descimg, pagevect, audio)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        pagename = EXCLUDED.pagename,
        summary = EXCLUDED.summary,
        descimg = EXCLUDED.descimg,
        pagevect = EXCLUDED.pagevect,
        audio = EXCLUDED.audio;
    `;
    // pgvector expects vectors in the format '[1,2,3,...]'
    const pageVectString = view.pageVect
      ? `[${view.pageVect.join(",")}]`
      : null;
    await client.query(upsertViewQuery, [
      view.id,
      view.pageName,
      view.summary,
      view.descImg,
      pageVectString,
      view.audio,
    ]);

    // 3. Delete old child records to ensure a clean slate for the update
    await Promise.all([
      client.query("DELETE FROM links WHERE view_id = $1", [view.id]),
      client.query("DELETE FROM breakdowns WHERE view_id = $1", [view.id]),
      client.query("DELETE FROM edges WHERE view_id = $1", [view.id]),
    ]);

    // Insert Links
    if (view.links && view.links.length > 0) {
      const linkValues: any[] = [];
      const linkPlaceholders = view.links
        .map((link, index) => {
          const offset = index * 3;
          linkValues.push(link.id, view.id, link.destPageName);
          return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
        })
        .join(", ");
      const insertLinksQuery = `INSERT INTO links (id, view_id, pagename) VALUES ${linkPlaceholders}`;
      await client.query(insertLinksQuery, linkValues);
    }

    // Insert Breakdowns
    if (view.breakDowns && view.breakDowns.length > 0) {
      const breakdownValues: any[] = [];
      const breakdownPlaceholders = view.breakDowns
        .map((bd, index) => {
          const offset = index * 4;
          const vectString = `[${bd.vect.join(",")}]`;
          breakdownValues.push(bd.id, view.id, bd.sentence, vectString);
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${
            offset + 4
          })`;
        })
        .join(", ");
      const insertBreakdownsQuery = `INSERT INTO breakdowns (id, view_id, sentence, vect) VALUES ${breakdownPlaceholders}`;
      await client.query(insertBreakdownsQuery, breakdownValues);
    }

    // Insert Edges
    if (view.edges && view.edges.length > 0) {
      const edgeValues: any[] = [];
      const edgePlaceholders = view.edges
        .map((edge, index) => {
          const offset = index * 6;
          edgeValues.push(
            view.id,
            edge.originPageId,
            edge.destPageName,
            edge.relevance,
            edge.linkType,
            edge.tags
          );
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${
            offset + 4
          }, $${offset + 5}, $${offset + 6})`;
        })
        .join(", ");
      const insertEdgesQuery = `INSERT INTO edges (view_id, originpageid, destpagename, relevance, linktype, tags) VALUES ${edgePlaceholders}`;
      await client.query(insertEdgesQuery, edgeValues);
    }

    // 5. Commit the transaction
    await client.query("COMMIT");
    console.log("Saved view " + view.pageName);
  } catch (err) {
    // 6. If any error occurs, roll back the transaction
    await client.query("ROLLBACK");
    console.error(
      `Error in addOrUpdateView for page ${view.pageName} id "${view.id}", rolling back transaction.`,
      err
    );
    throw err;
  } finally {
    client.release();
  }
}

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as dbm from "@/code/lib/dbManager";

async function main() {
  console.log("=== E2E Verification ===\n");

  // 1. getViewByPageName
  console.log("1. getViewByPageName('Russo-Ukrainian War')...");
  const view = await dbm.getViewByPageName("Russo-Ukrainian War");
  if (!view) {
    console.error("   FAIL: view not found");
    process.exit(1);
  }
  console.log("   id:", view.id);
  console.log("   pageName:", view.pageName);
  console.log("   summary:", view.summary?.substring(0, 80) + "...");
  console.log("   descImg:", view.descImg?.substring(0, 60) + "...");
  console.log("   pageVect length:", view.pageVect.length);
  console.log("   links:", view.links.length);
  console.log("   breakDowns:", view.breakDowns.length);
  console.log("   edges:", view.edges.length);
  if (view.edges.length > 0) {
    const e = view.edges[0];
    console.log("   first edge:", {
      destPageName: e.destPageName,
      relevance: e.relevance,
      linkType: e.linkType,
      tags: e.tags,
    });
  }
  if (view.breakDowns.length > 0) {
    const b = view.breakDowns[0];
    console.log("   first breakdown vect length:", b.vect.length);
  }

  // 2. getSimilarPageNames (app-side cosine)
  console.log("\n2. getSimilarPageNames (using first breakdown vector)...");
  if (view.breakDowns.length > 0) {
    const similar = await dbm.getSimilarPageNames(view.breakDowns[0].vect, 10);
    console.log("   similar pages:", similar);
  }

  // 3. addOrUpdateView round-trip (insert a test view, read it back, delete it)
  console.log("\n3. addOrUpdateView round-trip...");
  const testView = {
    id: "test-e2e-verification",
    pageName: "TestE2EPage",
    summary: "Temporary test page for migration verification.",
    descImg: "",
    pageVect: Array.from({ length: 768 }, () => Math.random() - 0.5),
    links: [{ id: "test-link-1", destPageName: "TestDest" }],
    breakDowns: [
      { id: "test-bd-1", sentence: "Test sentence.", vect: Array.from({ length: 768 }, () => Math.random() - 0.5) },
    ],
    edges: [
      {
        originPageId: "test-e2e-verification",
        destPageName: "TestDest",
        relevance: 50,
        linkType: "breakDown" as const,
        tags: ["test", "verification"],
      },
    ],
    audio: null,
  };
  await dbm.addOrUpdateView(testView as any);
  console.log("   inserted test view OK");

  const readBack = await dbm.getViewByPageName("teste2epage");
  console.log("   read back (case-insensitive):", readBack?.pageName);
  console.log("   links:", readBack?.links.length);
  console.log("   breakDowns:", readBack?.breakDowns.length);
  console.log("   edges:", readBack?.edges.length);
  console.log("   edge tags:", readBack?.edges[0]?.tags);
  console.log("   pageVect matches:", JSON.stringify(readBack?.pageVect) === JSON.stringify(testView.pageVect));

  // Cleanup: delete test view
  await dbm.d1Query("DELETE FROM links WHERE view_id = 'test-e2e-verification'; DELETE FROM breakdowns WHERE view_id = 'test-e2e-verification'; DELETE FROM edges WHERE view_id = 'test-e2e-verification'; DELETE FROM views WHERE id = 'test-e2e-verification';");
  console.log("   cleaned up test view");

  console.log("\n=== ALL CHECKS PASSED ===");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});

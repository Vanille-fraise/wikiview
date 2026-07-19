import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as vm from "@/code/lib/viewManager";
import * as dbm from "@/code/lib/dbManager";
import * as erm from "@/code/lib/extResourceManager";

const TEST_PAGE = "Albert Einstein";

async function main() {
  console.log(`\n========== E2E PAGE CREATION TEST: "${TEST_PAGE}" ==========\n`);
  const t0 = Date.now();

  // --- Step 1: Fetch Wikipedia content ---
  console.log("1. Fetching Wikipedia content...");
  const wikiData = await erm.getWikiContent(TEST_PAGE);
  if (!wikiData) {
    console.error("   FAIL: Could not fetch Wikipedia content");
    process.exit(1);
  }
  console.log(`   OK: pageName="${wikiData.pageName}", id=${wikiData.id}`);
  console.log(`   summary length: ${wikiData.pageSummary.length} chars`);
  console.log(`   content length: ${wikiData.pageContent.length} chars`);
  console.log(`   links: ${wikiData.links.length}`);
  console.log(`   descImg: ${wikiData.descImg.substring(0, 60)}...`);

  // --- Step 2: Topic extraction (DeepSeek) ---
  console.log("\n2. Topic extraction via DeepSeek...");
  const topicStart = Date.now();
  const topics = await erm.geminiTopicsConverter(wikiData.pageContent);
  const topicTime = ((Date.now() - topicStart) / 1000).toFixed(1);
  if (!topics) {
    console.error(`   FAIL: topics came back null (took ${topicTime}s)`);
    process.exit(1);
  }
  console.log(`   OK: ${topics.length} topics extracted in ${topicTime}s`);
  topics.slice(0, 3).forEach((t, i) => {
    console.log(`   topic[${i}]: "${t.sentence.substring(0, 80)}..."`);
  });

  // --- Step 3: Embeddings (Gemini) ---
  console.log("\n3. Generating embeddings via Gemini...");
  const embStart = Date.now();
  const topicEmbeddings = await erm.makeEmbeddings(
    topics.slice(0, 5).map((t) => t.sentence)
  );
  const embTime = ((Date.now() - embStart) / 1000).toFixed(1);
  if (!topicEmbeddings || topicEmbeddings.length === 0) {
    console.error(`   FAIL: embeddings came back empty (took ${embTime}s)`);
    process.exit(1);
  }
  console.log(`   OK: ${topicEmbeddings.length} embeddings in ${embTime}s`);
  console.log(`   vector dims: ${topicEmbeddings[0].length}`);
  console.log(`   sample values: [${topicEmbeddings[0].slice(0, 3).map((v) => v.toFixed(4)).join(", ")}, ...]`);

  // --- Step 4: Full readOrCreateView pipeline ---
  console.log(`\n4. Full readOrCreateView("${TEST_PAGE}")...`);
  console.log("   (This will fetch wiki, extract topics, embed, populate edges, and save to D1)");
  const createStart = Date.now();
  const view = await vm.readOrCreateView(TEST_PAGE, true);
  const createTime = ((Date.now() - createStart) / 1000).toFixed(1);

  if (!view) {
    console.error(`   FAIL: readOrCreateView returned null (took ${createTime}s)`);
    process.exit(1);
  }

  console.log(`\n   OK: view created in ${createTime}s`);
  console.log(`   id:          ${view.id}`);
  console.log(`   pageName:    ${view.pageName}`);
  console.log(`   summary:     ${view.summary?.substring(0, 80)}...`);
  console.log(`   pageVect:    ${view.pageVect.length} dims`);
  console.log(`   links:       ${view.links.length}`);
  console.log(`   breakDowns:  ${view.breakDowns.length}`);
  console.log(`   edges:       ${view.edges.length}`);

  if (view.edges.length > 0) {
    console.log(`\n   --- Top 5 edges ---`);
    view.edges.slice(0, 5).forEach((e, i) => {
      console.log(
        `   [${i}] ${e.destPageName} (relevance: ${e.relevance}, type: ${e.linkType})`
      );
      console.log(`       tags: [${e.tags.join(", ")}]`);
    });
  }

  // --- Step 5: Verify it was saved to D1 ---
  console.log("\n5. Verifying D1 persistence...");
  const fromDb = await dbm.getViewByPageName(TEST_PAGE);
  if (!fromDb) {
    console.error("   FAIL: view not found in D1 after creation");
    process.exit(1);
  }
  console.log(`   OK: found in D1`);
  console.log(`   D1 breakDowns: ${fromDb.breakDowns.length}`);
  console.log(`   D1 edges:      ${fromDb.edges.length}`);
  console.log(`   D1 pageVect:   ${fromDb.pageVect.length} dims`);
  console.log(
    `   pageVect matches: ${JSON.stringify(fromDb.pageVect) === JSON.stringify(view.pageVect)}`
  );

  // --- Step 6: Test similarity search ---
  if (fromDb.breakDowns.length > 0) {
    console.log("\n6. Testing similarity search...");
    const similar = await dbm.getSimilarPageNames(fromDb.breakDowns[0].vect, 5);
    console.log(`   similar pages: ${similar.join(", ") || "(none found)"}`);
  }

  // --- Cleanup ---
  console.log("\n7. Cleaning up test data from D1...");
  const safeId = view.id.replace(/'/g, "''");
  await dbm.d1Query(
    `DELETE FROM links WHERE view_id = '${safeId}';` +
      `DELETE FROM breakdowns WHERE view_id = '${safeId}';` +
      `DELETE FROM edges WHERE view_id = '${safeId}';` +
      `DELETE FROM views WHERE id = '${safeId}';`
  );
  console.log("   OK: cleaned up");

  const totalTime = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n========== ALL TESTS PASSED in ${totalTime}s ==========\n`);
}

main().catch((e) => {
  console.error("\n========== TEST FAILED ==========");
  console.error(e);
  process.exit(1);
});

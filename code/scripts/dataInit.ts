import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { initDb } from "@/code/lib/dbManager";
import { WikiDataExport } from "@/code/types/wikiDataExport";
import * as fs from "fs/promises";
import * as vm from "@/code/lib/viewManager";

const WIKI_DATA_PATH_FILE =
  "./data/wiki-raw-data/wiki-data-export-05-2025.json";
const INIT_PAGE_LIMIT = 1000;
const PAGE_SEARCH_DELAY_MS = 1000;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("Starting script...");
  const startScriptTime = Date.now();

  console.log("Initializing db script...");
  await initDb();

  console.log("Reading pages file...");
  const fileContent = await fs.readFile(WIKI_DATA_PATH_FILE, {
    encoding: "utf8",
  });

  const parsedData: WikiDataExport = JSON.parse(fileContent);
  console.log(
    "Pages file:\n" +
      parsedData.items[0].articles
        .slice(0, 3)
        .map((a) => `[${a.views} views] ${a.article}`)
        .join("\n") +
      "\n[...]"
  );

  console.log("Reading or creating views...");
  const viewPromises = parsedData.items[0].articles
    .slice(0, INIT_PAGE_LIMIT)
    .map(async (article, index) => {
      // Artificial delay to not break API call limits.
      await delay(index * PAGE_SEARCH_DELAY_MS);
      return vm.readOrCreateView(article.article, false);
    });
  const allViews = await Promise.all(viewPromises);
  const filteredViews = allViews.filter((v) => v);

  const populatedViewsProm = filteredViews.map(async (v, index) => {
    // Artificial delay to not break API call limits.
    await delay(index * PAGE_SEARCH_DELAY_MS);
    if (!v) {
      return null;
    }

    const encodedPageName = encodeURIComponent(v.pageName);
    const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&explaintext=1&redirects=1&titles=${encodedPageName}&origin=*`;

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        console.error(`HTTP error for "${v.pageName}": ${response.status}`);
        return null;
      }

      const data = await response.json();
      const pages = data.query?.pages;
      if (!pages) {
        console.error(
          `Invalid API response for "${v.pageName}": no "pages" object.`
        );
        return null;
      }

      const pageId = Object.keys(pages)[0];

      if (pageId === "-1") {
        console.warn(`Page not found on Wikipedia: "${v.pageName}"`);
        return null;
      }

      const pageData = pages[pageId];
      const text = pageData.extract;

      return vm.populateEdges(v, text, true);
    } catch (error) {
      console.error(`Failed to fetch data for "${v.pageName}":`, error);
    }
  });
  const populatedViews = await Promise.all(populatedViewsProm);
  console.log(
    `Populated ${
      populatedViews.filter((b) => b).length
    } views succesfully, failed ${populatedViews.filter((b) => !b).length}.`
  );
  const elapsedSeconds = (Date.now() - startScriptTime) / 1000;
  console.log(
    `Script took ${elapsedSeconds}s.\n${
      filteredViews.length
    } views read or created.\n${
      allViews.length - filteredViews.length
    } views not found and imposisble to create.\nAn average of ${
      elapsedSeconds / filteredViews.length
    } sec/view.`
  );
}

main().catch((error) => {
  console.error("An unhandled error occurred in main:", error);
});

"use server";

import { View, Link, emptyView, Edge } from "@/code/types/view";
import * as dotenv from "dotenv";
import * as dbm from "@/code/lib/dbManager";
import * as erm from "@/code/lib/extResourceManager";
import { GEMINI_EMBEDDING_BATCH_LIMIT } from "@/code/lib/extResourceManager";
import { sanitized } from "./utils";

dotenv.config();

const EDGES_LIMIT = 20;

async function readView(viewName: string): Promise<View | null> {
  return dbm.getViewByPageName(viewName);
}

async function createView(
  viewName: string,
  triggerPopulateEdges = true
): Promise<View | null> {
  console.log("Creating view " + viewName + ".");
  const wikiData = await erm.getWikiContent(viewName);
  if (!wikiData) {
    console.error("Cannot fetch wikipedia data for page " + viewName + ".");
    return null;
  }

  const view: View = {
    id: wikiData.id,
    pageName: wikiData?.pageName,
    summary: wikiData.pageSummary,
    descImg: wikiData.descImg,
    links: wikiData.links.map((l) => {
      return {
        id: "l-" + wikiData.pageName + "-" + l,
        destPageName: l,
        relevance: -1,
      };
    }),
    pageVect: [],
    edges: [],
    audio: null,
    breakDowns: [],
  };

  const topics = await erm.geminiTopicsConverter(wikiData.pageContent);
  if (!topics) {
    console.error(
      "Impossible to generate usable topics for page " + viewName + "."
    );
    return null;
  }
  var embeddings: number[][] = [];
  for (let i = 0; i < topics.length; i += GEMINI_EMBEDDING_BATCH_LIMIT) {
    const newEmbeddings = await erm.makeEmbeddings(
      topics
        .slice(i, i + GEMINI_EMBEDDING_BATCH_LIMIT)
        .map((topic) => topic.sentence)
    );
    if (!newEmbeddings) {
      throw new Error(
        "Impossible to generate embeddings for the following topics:\n" +
          topics.slice(i, i + GEMINI_EMBEDDING_BATCH_LIMIT).join("\n")
      );
    }
    embeddings = embeddings.concat(newEmbeddings);
  }

  const newBreakDowns = topics.map((topic, index) => ({
    id: "b-" + view.pageName + "-" + index,
    sentence: topic.sentence,
    vect: embeddings[index] ?? [],
  }));
  view.breakDowns.push(...newBreakDowns);

  view.pageVect = (await erm.makeEmbeddings([view.summary]))?.at(0) ?? [];

  if (triggerPopulateEdges) {
    const popEdges = await populateEdges(view, wikiData.pageContent);
    if (popEdges) {
      console.log(
        `Populated ${view.edges.length} edges succesfully for ${view.pageName}.`
      );
    } else {
      console.log(`Could not populate edges for ${view.pageName}.`);
    }
  }

  await dbm.addOrUpdateView(view);
  return view;
}

export async function readOrCreateView(
  viewName: string,
  triggerPopulateEdges = true
): Promise<View | null> {
  const view = await readView(viewName);
  if (view) {
    return view;
  } else {
    return createView(viewName, triggerPopulateEdges);
  }
}

export async function populateEdges(
  view: View,
  wikiPageContent: string,
  upsertView = false,
  edgesLimit = EDGES_LIMIT
): Promise<boolean> {
  console.log;
  const breakDownPagesProm = view.breakDowns.map((b) => {
    return dbm.getSimilarPageNames(b.vect, EDGES_LIMIT);
  });
  const breakdownPages = (await Promise.all(breakDownPagesProm)).flat();
  const allSimilarPages = breakdownPages.concat(
    view.links.map((l) => l.destPageName)
  );
  const edgeInfos = await erm.makeEdgeInfo(allSimilarPages, wikiPageContent);
  if (!edgeInfos) {
    console.error(`Could not make geminiEdgesInfo for view ${view.pageName}.`);
    return false;
  }
  view.edges = edgeInfos
    .map((info) => {
      let linkType: Edge["linkType"];
      const inLinks = view.links.find(
        (l) =>
          l.destPageName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() ==
          info.destPageName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
      );
      const inBreakDownPages = breakdownPages.find(
        (bp) =>
          String(bp)
            .replace(/[^a-zA-Z0-9]/g, "")
            .toLowerCase() ==
          info.destPageName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
      );
      linkType = inLinks
        ? inBreakDownPages
          ? "hybrid"
          : "hyper"
        : "breakDown";
      return {
        originPageId: view.id,
        destPageName: info.destPageName,
        relevance: info.relevance,
        linkType,
        tags: info.tags.map((t) => sanitized(t)),
      };
    })
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, edgesLimit);
  if (upsertView) {
    await dbm.addOrUpdateView(view);
  }
  return true;
}

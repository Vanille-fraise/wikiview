import {
  GoogleGenAI,
  EmbedContentResponse,
} from "@google/genai";

export const EMBEDDINGS_DIMENSIONS = 768;

interface Topic {
  sentence: string;
}

interface EdgeInfo {
  destPageName: string;
  relevance: number;
  tags: string[];
}

interface WikiContent {
  id: string;
  pageName: string;
  pageContent: string;
  pageSummary: string;
  descImg: string;
  links: string[];
}

const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
export const GEMINI_EMBEDDING_BATCH_LIMIT = 100;

const OPENCODE_CHAT_URL = "https://opencode.ai/zen/v1/chat/completions";

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _ai;
}

async function chatCompletion(
  prompt: string,
  options?: { maxTokens?: number; jsonMode?: boolean }
): Promise<string | null> {
  const apiKey = process.env.OPENCODE_API_KEY;
  const model = process.env.OPENCODE_MODEL || "deepseek-v4-flash-free";
  const maxTokens = options?.maxTokens ?? 16000;
  try {
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      thinking: { type: "disabled" },
    };
    if (options?.jsonMode) {
      body.response_format = { type: "json_object" };
    }
    const resp = await fetch(OPENCODE_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.error(`OpenCode API error: ${JSON.stringify(data)}`);
      return null;
    }
    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    const finishReason = choice?.finish_reason;
    if (!content) {
      console.error(
        `OpenCode API returned empty content (finish_reason: ${finishReason}, ` +
        `reasoning_tokens: ${data.usage?.completion_tokens_details?.reasoning_tokens ?? "unknown"})`
      );
      return null;
    }
    return content;
  } catch (error: any) {
    console.error("OpenCode chat completion error:", error.message);
    return null;
  }
}

function cleanJsonResponse(text: string): string {
  return text
    .trim()
    .replace(/^```json\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
}

export async function makeEmbeddings(
  contents: string[]
): Promise<number[][] | undefined> {
  if (!contents) {
    console.warn("  - WARNING: Content for embedding is empty. Skipping.");
    return undefined;
  }
  try {
    const result: EmbedContentResponse = await getAI().models.embedContent({
      model: GEMINI_EMBEDDING_MODEL,
      contents,
      config: {
        taskType: "SEMANTIC_SIMILARITY",
        outputDimensionality: EMBEDDINGS_DIMENSIONS,
      },
    });
    const embedding: number[][] | undefined = result.embeddings
      ?.map((e) => e.values)
      .filter((e) => e !== undefined);
    if (embedding) {
      return embedding;
    } else {
      console.error(
        "Error: No embedding values found in the response for content."
      );
      return undefined;
    }
  } catch (error: any) {
    console.error("Error making embeddings:", error.message);
    return undefined;
  }
}

export async function getWikiContent(
  pageName: string,
  _disambigDepth: number = 0
): Promise<WikiContent | null> {
  const baseParams = `action=query&format=json&explaintext=1&redirects=1&titles=${encodeURIComponent(
    pageName
  )}`;

  const summaryApiUrl = `https://en.wikipedia.org/w/api.php?${baseParams}&prop=extracts&exintro=1&origin=*`;
  const fullDataApiUrl = `https://en.wikipedia.org/w/api.php?${baseParams}&prop=extracts|pageprops|pageimages|links&pithumbsize=500&pllimit=max&origin=*`;

  try {
    const [summaryResponse, fullDataResponse] = await Promise.all([
      fetch(summaryApiUrl),
      fetch(fullDataApiUrl),
    ]);

    if (!summaryResponse.ok || !fullDataResponse.ok) {
      console.error(
        new Error(
          `HTTP error! Status: ${summaryResponse.status} or ${fullDataResponse.status} for ${pageName}`
        )
      );
      return null;
    }

    const summaryData = await summaryResponse.json();
    const fullData = await fullDataResponse.json();

    const pages = fullData.query?.pages;
    if (!pages) {
      console.error(
        `Error: No page data found in API response for '${pageName}'.`
      );
      return null;
    }

    const pageId = Object.keys(pages)[0];
    const page = pages[pageId];

    if (page.missing) {
      console.error(
        `Error: The page '${pageName}' was not found on Wikipedia.`
      );
      return null;
    }

    if (page.pageprops && "disambiguation" in page.pageprops) {
      const firstLink = page.links?.[0]?.title;
      if (firstLink && _disambigDepth < 3) {
        console.log(
          `'${pageName}' is ambiguous. Fetching first result: '${firstLink}'`
        );
        return getWikiContent(firstLink, _disambigDepth + 1);
      }
      console.error(`'${pageName}' is ambiguous with no usable links.`);
      return null;
    }

    const pageSummary = summaryData.query.pages[pageId]?.extract;
    const pageContent = page.extract;

    const id = pageId;
    const canonicalPageName = page.title;
    const descImg = page.thumbnail?.source ?? "";
    const links =
      page.links?.map((link: { title: string }) => link.title) ?? [];

    if (pageContent && typeof pageSummary === "string") {
      return {
        id,
        pageName: canonicalPageName,
        pageContent,
        pageSummary,
        descImg,
        links,
      };
    } else {
      console.error(
        `Error: Could not retrieve content for page '${pageName}'. One or both extracts were missing.`
      );
      return null;
    }
  } catch (error: any) {
    console.error(
      `Error fetching Wikipedia content for '${pageName}':`,
      error.message
    );
    return null;
  }
}

export async function geminiTopicsConverter(
  text: string
): Promise<Topic[] | null> {
  const processedText = text.trim();

  if (!text || processedText === "") {
    console.log(
      "  - WARNING: Text content is empty. Skipping analysis."
    );
    return null;
  }

  const prompt = `
    Analyze the following Wikipedia article text. Your task is to identify the most important topics and key information.
    You must always refer to events, known figures, cultural piece and events with full names.
    Pronoms are too vague and lead to confusion and are therefore forbidden.

    For each topic you identify, provide the following information:
    1.  'sentence': A very succinct, single sentence summary. Every single word must be useful; remove all fluff.

    Format your entire response as a single valid JSON array of objects. Do not include any text or formatting outside of this JSON array.

    Example format:
    [
      {"sentence": "The subject was born in a specific, noteworthy location."},
      {"sentence": "A major discovery or achievement is attributed to the subject."}
    ]

    Here is the text to analyze:
    ---
    ${processedText}
    `;

  try {
    const textResponse = await chatCompletion(prompt, { jsonMode: true });
    if (!textResponse) {
      console.log(
        new Error(
          "Chat result text is empty for text:" +
            text.substring(0, 60) +
            "[...]"
        )
      );
      return null;
    }

    const cleanedResponse = cleanJsonResponse(textResponse);
    return JSON.parse(cleanedResponse) as Topic[];
  } catch (e: any) {
    console.error(
      `  - ERROR: Topic analysis failed or returned invalid JSON. Reason: ${e.message}`
    );
    return null;
  }
}

export async function makeEdgeInfo(
  destPageNames: string[],
  wikiPageContent: string
): Promise<EdgeInfo[] | null> {
  const truncatedContent = wikiPageContent.slice(0, 6000);
  const uniqueNames = [...new Set(destPageNames)].slice(0, 80);
  const prompt = `You are analyzing a Wikipedia article to rank linked pages by importance.

TASK: For each linked page that is genuinely related to the article topic, output:
- "destPageName": exact page name from the list
- "relevance": integer 0-100 (100 = essential to understanding the article, 50 = moderately important, 10 = tangentially related). Score based on actual topical connection, not just mention frequency.
- "tags": 2-4 short lowercase tags describing the thematic relationship (e.g. ["physics", "quantum-theory", "nobel-prize"]). Tags must be shared across related pages.

EXCLUDE pages with no real connection to the article. Return ONLY the top 20 most relevant.

Linked pages: ${uniqueNames.join(", ")}

Article excerpt: ${truncatedContent}

Output JSON array now:`;

  try {
    const textResponse = await chatCompletion(prompt, { jsonMode: true, maxTokens: 8000 });
    if (!textResponse) {
      console.log(
        new Error(
          "Chat result text is empty when generating edges info for article: " +
            wikiPageContent.substring(0, 60) +
            "[...]"
        )
      );
      return null;
    }

    const cleanedResponse = cleanJsonResponse(textResponse);
    return JSON.parse(cleanedResponse) as EdgeInfo[];
  } catch (e: any) {
    console.error(
      `  - ERROR: Could not provide edgeInfos. Reason: ${e.message}.\n<prompt>${prompt}\n<prompt/>`
    );
    return null;
  }
}

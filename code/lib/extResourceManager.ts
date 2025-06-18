import {
  GoogleGenAI,
  EmbedContentResponse,
  Type,
  GenerateContentParameters,
  GenerateContentConfig,
} from "@google/genai";

export const EMBEDDINGS_DIMENSIONS = 768;

interface GeminiTopic {
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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_EMBEDDING_MODEL = "text-embedding-004";
export const GEMINI_EMBEDDING_BATCH_LIMIT = 100;
const GEMINI_TOPIC_MODEL = "gemini-2.0-flash";
const GEMINIT_TTS_MODEL = "gemini-2.5-flash-preview-tts";

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export async function makeEmbeddings(
  contents: string[]
): Promise<number[][] | undefined> {
  if (!contents) {
    console.warn("  - WARNING: Content for embedding is empty. Skipping.");
    return undefined;
  }
  try {
    const result: EmbedContentResponse = await ai.models.embedContent({
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
  pageName: string
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
      console.error(
        `Error: '${pageName}' is ambiguous. Please try a more specific title.`
      );
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
): Promise<GeminiTopic[] | null> {
  const processedText = text.trim();

  if (!text || processedText === "") {
    console.log(
      "  - WARNING: Text content is empty. Skipping Gemini analysis."
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
    const result = await ai.models.generateContent({
      model: GEMINI_TOPIC_MODEL,
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          sentence: Type.STRING,
        },
      },
    });

    if (!result.text) {
      console.log(
        new Error(
          "Gemini result text is empty for text:" +
            text.substring(0, 60) +
            "[...]"
        )
      );
      return null;
    }

    const textResponse: string = result.text;

    const cleanedResponse = textResponse
      .trim()
      .replace(/^```json\n?/, "")
      .replace(/\n?```$/, "");
    return JSON.parse(cleanedResponse) as GeminiTopic[];
  } catch (e: any) {
    console.error(
      `  - ERROR: Gemini topic analysis failed or returned invalid JSON. Reason: ${e.message}`
    );
    if (e.response?.text) {
      console.error(
        `  - Gemini's raw response was: ${e.response.text.substring(0, 200)}...`
      );
    }
    return null;
  }
}

export async function makeEdgeInfo(
  destPageNames: string[],
  wikiPageContent: string
): Promise<EdgeInfo[] | null> {
  const prompt = `
    <goal>
    Build a helpful wikipedia helper by providings a list of connected articles for a given page and prioritizing they usefulness.
    </goal>

    <instructions>
    Analyze the input Wikipedia article text and the list of linked wikipedia pages titles.
    Your task is to identify the most important topics and key information, to provide a relevance score and a list of tags for each.
    The tags must have sementical meenings based on the analized Wikipedia article, multiple linked pages should share common tags. Tags will be used to sort the linked pages for better visibility and context filtering.

    For each topic you identify, provide the following informations:
    1.  'destPageName': The page name you are providing informations for.
    2.  'relevance': The interger which indicates how important is the destPageName relative to the wikipedia article. From 0 the most dispensable page to 100 the most crucial informations. 
    3.  'tags': The list of tags which can be attributed to destPageName.
    </instructions>
    
    <outputFormat>
    Format your entire response as a single valid JSON array of objects. Do not include any text or formatting outside of this JSON array. Provide only the data for the most relevant pages, up to 80 pages.

    Example format:
    [
      {"destPageName": "climat_change", "relevance": 72, "tags": ["human-origin", "urgent", "global"]},
      {"destPageName": "albedo", "relevance": 8, "tags": ["physical-phenomenon", "global"]},
    ]
    </outputFormat>

    <input>
      <wikipediaArticle>
      ${wikiPageContent}
      </wikipediaArticle>

      <listOfDestPageNames>
      ${[...new Set(destPageNames)]}
      </listOfDestPageNames>
    </input>
    `;

  try {
    const result = await ai.models.generateContent({
      model: GEMINI_TOPIC_MODEL,
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          destPageName: Type.STRING,
          relevance: Type.NUMBER,
          tags: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
          },
        },
      },
    });

    if (!result.text) {
      console.log(
        new Error(
          "Gemini result text is empty when generating edges info for article: " +
            wikiPageContent.substring(0, 60) +
            "[...]"
        )
      );
      return null;
    }

    const textResponse: string = result.text;

    const cleanedResponse = textResponse
      .trim()
      .replace(/^```json\n?/, "")
      .replace(/\n?```$/, "");

    return JSON.parse(cleanedResponse) as EdgeInfo[];
  } catch (e: any) {
    console.error(
      `  - ERROR: Gemini could not provide edgeInfos. Reason: ${e.message}.\n<prompt>${prompt}\n<prompt/>`
    );
    if (e.response?.text) {
      console.error(
        `  - Gemini's raw response was: ${e.response.text.substring(0, 200)}...`
      );
    }
    return null;
  }
}

export async function generateAudio(
  text: string
): Promise<Buffer<ArrayBufferLike> | null> {
  const response = await ai.models.generateContent({
    model: GEMINIT_TTS_MODEL,
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Kore" },
        },
      },
    },
  });
  const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (data) {
    return Buffer.from(data, "base64");
  }
  return null;
}

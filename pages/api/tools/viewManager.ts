import { View, Link } from '../../../code/types/view';
import path from 'path';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const DATA_PATH = 'data/view';

function dataPath(viewName: string): string {
  return path.join(process.cwd(), DATA_PATH, viewName, `${viewName}.json`);
}

async function readView(viewName: string): Promise<View | null> {
  const filePath = dataPath(viewName);
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const pageData: View = JSON.parse(fileContent);
    return pageData;
  } catch (error) {
    console.log(`Not able to read page data for "${viewName}":`, error);
    return null;
  }
}

async function createView(viewName: string): Promise<View> {
  try {
    // 1. Fetch data from Wikipedia API
    const wikipediaApiUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts|pageimages|info|links&titles=${encodeURIComponent(
      viewName
    )}&exintro&explaintext&piprop=original|thumbnail&pithumbsize=500&inprop=url&pllimit=max`;

    const wikipediaResponse = await axios.get(wikipediaApiUrl);
    const pages = wikipediaResponse.data.query.pages;
    const pageId = Object.keys(pages)[0];
    const pageData = pages[pageId];

    if (!pageData || pageData.missing) {
      throw new Error(`Wikipedia page for "${viewName}" not found.`);
    }

    // 2. Extract data from Wikipedia response
    const id = pageData.pageid;
    const name = pageData.title;
    const descImg = pageData.original ? pageData.original.source : (pageData.thumbnail ? pageData.thumbnail.source : '');
    const wikipediaContent = pageData.extract;

    // 3. Create a recap with Gemini 2.0 Flash API
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not found in .env.local');
    }

    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`;
    const geminiResponse = await axios.post(geminiApiUrl, {
      contents: [{
        parts: [{
          text: `Please provide a one-sentence summary of the following text:

${wikipediaContent}`
        }]
      }]
    });

    const recap = geminiResponse.data.candidates[0].content.parts[0].text.trim();

    // 4. Extract links
    const links: Link[] = (pageData.links || []).map((link: any) => ({
      id: link.title.replace(/\s+/g, '_').toLowerCase(), // Create a simple ID from the title
      name: link.title,
      relevance: 0,
      tags: [],
    }));

    // 5. Construct the View object
    const newView: View = {
      id,
      name,
      description: recap,
      descImg,
      audio: null,
      links,
    };

    // 6. Save the new view to a file
    const filePath = dataPath(viewName);
    const dirPath = path.dirname(filePath);
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(newView, null, 2));

    return newView;
  } catch (error) {
    console.error(`Failed to create view for "${viewName}":`, error);
    throw error;
  }
}

export async function readOrCreateView(viewName: string): Promise<View> {
  const view = await readView(viewName);
  console.log(view);
  if (view) {
    console.log("view found!");

    return view;
  } else {
    console.error('could not find view');
    return fakeView;
  }
  // return view ? view : createView(viewName);
}

const fakeView: View = {
  id: "1",
  name: "Fenêtre",
  description: "je suis une super fenêtre",
  descImg: "http://fleuriste.com/img.png",
  links: [
    {
      id: "2",
      name: "Étoile",
      tags: ["forme", "taille"],
      relevance: 1,
    },
    {
      id: "3",
      name: "Aluminium",
      tags: ["materiau"],
      relevance: 2,
    },
  ],
  audio: null,
};

  
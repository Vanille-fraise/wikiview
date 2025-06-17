from google import genai
from google.genai import types
from google.genai.types import EmbedContentConfig

import pandas as pd
import wikipedia
import requests
import json

client = genai.Client(api_key="AIzaSyD2TvGLnondTPBCXcOXQrxPgPTOGdvGqsY")

dataname = '../data/wiki-raw-data/topviews.csv'
rowlimit = 100
# gemini_embedding_model = "gemini-embedding-exp-03-07"
gemini_embedding_model = "text-embedding-004"
gemini_topic_model = "gemini-2.0-flash"

def get_wiki_content(page_name: str) -> str:
    """
    Gets the plain text content of a Wikipedia page.

    Args:
        page_name: The title of the Wikipedia page (e.g., "Python (programming language)").

    Returns:
        The plain text content of the page as a string,
        or an error message if the page cannot be found or is ambiguous.
    """
    try:
        # Fetch the page object. The `auto_suggest=False` can prevent
        # it from guessing a different page. Set to True if you want suggestions.
        page = wikipedia.page(page_name, auto_suggest=False)
        return page.content
        
    except wikipedia.exceptions.PageError:
        # This error is raised if the page doesn't exist.
        return f"Error: The page '{page_name}' was not found on Wikipedia."
        
    except wikipedia.exceptions.DisambiguationError as e:
        # This error is raised for ambiguous terms (e.g., "Python").
        # The exception object 'e' contains a list of suggested page titles.
        options = "\n - ".join(e.options[:5]) # Show the first 5 options
        return f"Error: '{page_name}' is ambiguous. Try one of these:\n - {options}"

    except requests.exceptions.RequestException:
        # Handle potential network errors
        return "Error: A network problem occurred. Please check your connection."



def make_embeddings(content):
        print("embedding", content)
        result = client.models.embed_content(
                model=gemini_embedding_model,
                contents=content,
                config=EmbedContentConfig(
                        task_type="SEMANTIC_SIMILARITY",  # Optional
                        output_dimensionality=768,
                ),
        )
        print(result.embeddings)
        return result.embeddings

def get_CSV_data():
        try:
                df = pd.read_csv(dataname)
                data = df[['Page']].head(rowlimit)
                return data
        except FileNotFoundError:
                print(f"Error: The file '{dataname}' was not found.")
        except KeyError as e:
                print(f"Error: A required column was not found in the CSV. Details: {e}")

def analyze_text_with_gemini(text: str) -> list[dict] | None:
    print("analyzing a new page")
    """Sends text to Gemini API to extract a list of important topics."""
    if not text or text.isspace():
        print("  - WARNING: Text content is empty. Skipping Gemini analysis.")
        return None

    prompt = f"""
    Analyze the following Wikipedia article text. Your task is to identify the most important topics and key information.

    For each topic you identify, provide two things:
    1.  'sentence': A very succinct, single sentence summary. Every single word must be useful; remove all fluff.
    2.  'importance': A score from 0 (useless) to 100 (the single most important piece of information) indicating how important the topic is to understanding the overall subject.

    Format your entire response as a single valid JSON array of objects. Do not include any text or formatting outside of this JSON array.

    Example format:
    [
      {{"sentence": "The subject was born in a specific, noteworthy location.", "importance": 85}},
      {{"sentence": "A major discovery or achievement is attributed to the subject.", "importance": 95}}
    ]

    Here is the text to analyze:
    ---
    {text[:8000]}
    """
    response = None
    try:
        response = client.models.generate_content(model=gemini_topic_model, contents=prompt)
        cleaned_response = response.text.strip().replace('```json', '').replace('```', '')
        return json.loads(cleaned_response)
    except Exception as e:
        print(f"  - ERROR: Gemini topic analysis failed or returned invalid JSON. Reason: {e}")
        # It's helpful to see what the API returned on failure
        if hasattr(response, 'text'):
            print(f"  - Gemini's raw response was: {response.text[:200]}...")
        return None

def main():
        datas = get_CSV_data()
        wiki_pages = [get_wiki_content(data[0]) for data in datas.to_numpy()]
        print("wiki done")
        recaps = [analyze_text_with_gemini(page) for page in wiki_pages]
        print(recaps)
        print("nb of topics", sum(len(inner_list) for inner_list in recaps))
        print("\n---------- Embeddings \n")
        embeddings = []
        flatten = [item for sublist in recaps for item in sublist]
        for i in range(rowlimit):
              eb = make_embeddings(flatten[i]["sentence"])
              embeddings.append(eb)
              print(eb)

        

main()


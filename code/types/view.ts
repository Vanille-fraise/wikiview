export interface Link {
  id: string;
  destPageName: string;
}

export interface BreakDown {
  id: string;
  sentence: string;
  vect: number[];
}

export interface Edge {
  originPageId: string;
  destPageName: string;
  relevance: number;
  linkType: "hyper" | "breakDown" | "hybrid";
  tags: string[];
}

export interface View {
  id: string;
  pageName: string;
  summary: string;
  descImg: string;
  links: Link[];
  pageVect: number[];
  edges: Edge[];
  audio: string | null;
  breakDowns: BreakDown[];
}

export const emptyView: View = {
  id: "empty_view",
  pageName: "Main_Page",
  summary: "This is the main page without edges.",
  descImg: "https://fr.wikipedia.org/wiki/Logo_de_Wikipédia",
  links: [],
  pageVect: [],
  edges: [],
  audio: null,
  breakDowns: [],
};

export const loadingView: View = {
  id: "loading",
  pageName: "      Loading...      ",
  summary: "",
  descImg: "/loading.gif",
  links: [],
  pageVect: [],
  edges: [],
  audio: null,
  breakDowns: [],
};

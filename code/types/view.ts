export interface Link {
  id: string;
  name: string;
  tags: string[];
  relevance: number;
}

export interface View {
  id: string;
  name: string;
  description: string;
  descImg: string;
  links: Link[];
  audio: string | null;
}

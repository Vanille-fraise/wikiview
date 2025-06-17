export interface WikiDataExport {
  items: [
    {
      project: string;
      access: string;
      year: string;
      month: string;
      day: string;
      articles: [
        {
          article: string;
          views: number;
          rank: number;
        }
      ];
    }
  ];
}

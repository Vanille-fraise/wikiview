import { View } from "../../../../code/types/view";
import type { NextApiRequest, NextApiResponse } from "next";
import * as vm from "@/code/lib/viewManager";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<View | { error: string }>
) {
  if (req.method === "GET") {
    const { viewName } = req.query;
    if (typeof viewName !== "string") {
      res.status(405).end(`ViewName parameter type ${viewName} Not Allowed`);
    } else {
      const view = await vm.readOrCreateView(viewName);
      if (view) {
        res.status(200).json(view);
      } else {
        res
          .status(500)
          .json({ error: `Failed to read or create view ${viewName}.` });
      }
    }
  } else {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

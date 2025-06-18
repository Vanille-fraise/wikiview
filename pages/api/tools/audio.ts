import { NextApiRequest, NextApiResponse } from "next";
import { View } from "@/code/types/view";
import * as adm from "@/code/lib/audioManager";

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ url: string } | { error: string }>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
  try {
    const viewReq = req.body;

    if (!viewReq || !(viewReq.view as View)) {
      return res.status(400).json({
        error: "Request must contain a View element.",
      });
    }
    const view = viewReq.view as View;
    const url = await adm.createAndSaveAudio(view);
    if (url) {
      res.status(200).json({ url: url });
    } else {
      res.status(500).json({ error: "Failed to generate audio." });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "An internal server error occurred." });
  }
}

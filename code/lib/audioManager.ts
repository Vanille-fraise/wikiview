import { put, PutBlobResult } from "@vercel/blob";
import { View } from "@/code/types/view";
import * as dbm from "@/code/lib/dbManager";
import * as erm from "@/code/lib/extResourceManager";
import { Buffer } from "buffer";
import wav from "wav";
import "concat-stream";
import { SUMMARY_LENGTH } from "./variables";
import { cleanSummary } from "./utils";

const AUDIO_OPT = { channels: 1, sampleRate: 24000, bitDepth: 16 };

async function createWavBuffer(
  rawAudioData: ArrayBufferLike,
  options: {
    channels: number;
    sampleRate: number;
    bitDepth: number;
  }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const wavWriter = new wav.Writer(options);
    const chunks: Buffer[] = [];
    wavWriter.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    wavWriter.on("end", () => {
      const completeWavBuffer = Buffer.concat(chunks);
      resolve(completeWavBuffer);
    });

    wavWriter.on("error", reject);
    let inputBuffer: Buffer;
    if (rawAudioData instanceof Buffer) {
      inputBuffer = rawAudioData;
    } else {
      inputBuffer = Buffer.from(rawAudioData);
    }
    wavWriter.write(inputBuffer);
    wavWriter.end();
  });
}

export async function uploadBlobData(
  dataName: string,
  dataType: string,
  data: Buffer
): Promise<PutBlobResult> {
  const blobResponse = await put(dataName + "-" + dataType, data, {
    access: "public",
    addRandomSuffix: true,
  });
  return blobResponse;
}

export async function createAndSaveAudio(view: View): Promise<string | null> {
  const audioBuffer = await erm.generateAudio(cleanSummary(view.summary));
  if (!audioBuffer) return null;
  const wavBuffer = await createWavBuffer(audioBuffer.buffer, AUDIO_OPT);
  const blobResponse = await uploadBlobData(
    view.pageName,
    "audio.wav",
    wavBuffer
  );
  view.audio = blobResponse.url;
  dbm.addOrUpdateView(view);
  console.log(`Audio created for view ${view.pageName}. URL: ${view.audio}`);
  return view.audio;
}

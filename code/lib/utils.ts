import Color from "color";
import { SUMMARY_LENGTH } from "./variables";

export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function interpolateColor(
  startColor: string,
  endColor: string,
  factor: number
): string {
  const start = Color(startColor);
  const end = Color(endColor);
  const mixedColor = start.mix(end, factor);

  return mixedColor.rgb().string();
}

export function sanitized(input: string): string {
  const alphanumericAndUnderscoreOnly = input
    .replace(/ /g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "");
  const lowercased = alphanumericAndUnderscoreOnly.toLowerCase();
  return lowercased;
}

export function cleanSummary(summary: string): string {
  const words = summary
    ? summary.split(/\s+/).filter((word) => word.length > 0)
    : [];
  const res =
    words.length <= SUMMARY_LENGTH
      ? summary
      : summary.trim().split(/\s+/).slice(0, SUMMARY_LENGTH).join(" ") +
        " [...]";
  return res;
}

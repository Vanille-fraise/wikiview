import Color from "color";

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

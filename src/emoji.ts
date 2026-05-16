import { EMOTION_KEYS, type EmotionKey } from "./storage";

export type { EmotionKey };
export { EMOTION_KEYS };

export const EMOJI_GLYPH: Record<EmotionKey, string> = {
  happy: "😊",
  calm: "😌",
  tired: "😪",
  sad: "😢",
  angry: "😠",
  anxious: "😰",
};

export const EMOJI_LABEL_KEY: Record<EmotionKey, string> = {
  happy: "emoji_happy",
  calm: "emoji_calm",
  tired: "emoji_tired",
  sad: "emoji_sad",
  angry: "emoji_angry",
  anxious: "emoji_anxious",
};

export function glyphOf(key: EmotionKey): string {
  return EMOJI_GLYPH[key];
}

export function labelKeyOf(key: EmotionKey): string {
  return EMOJI_LABEL_KEY[key];
}

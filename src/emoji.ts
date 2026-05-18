/**
 * @file Emoji glyph and i18n label mapping for the six supported emotion keys.
 */
import { EMOTION_KEYS, type EmotionKey } from "./storage";

export type { EmotionKey };
export { EMOTION_KEYS };

/** Unicode glyph displayed for each emotion. */
export const EMOJI_GLYPH: Record<EmotionKey, string> = {
  happy: "😊",
  calm: "😌",
  tired: "😪",
  sad: "😢",
  angry: "😠",
  anxious: "😰",
};

/** Per-emotion i18n message key used for accessible labels. */
export const EMOJI_LABEL_KEY: Record<EmotionKey, string> = {
  happy: "emoji_happy",
  calm: "emoji_calm",
  tired: "emoji_tired",
  sad: "emoji_sad",
  angry: "emoji_angry",
  anxious: "emoji_anxious",
};

/**
 * Return the unicode glyph for an emotion key.
 * @param key The emotion identifier.
 */
export function glyphOf(key: EmotionKey): string {
  return EMOJI_GLYPH[key];
}

/**
 * Return the i18n message key (for `chrome.i18n.getMessage`) for an emotion's label.
 * @param key The emotion identifier.
 */
export function labelKeyOf(key: EmotionKey): string {
  return EMOJI_LABEL_KEY[key];
}

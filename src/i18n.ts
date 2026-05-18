/**
 * @file Thin wrapper around `chrome.i18n` that applies localized text to DOM
 * elements via `data-i18n` and `data-i18n-attr` attributes.
 */

/**
 * Look up a localized message by key, falling back to the key when no
 * translation is found (useful during development).
 * @param key Message key declared in `_locales/*\/messages.json`.
 * @param substitutions Optional substitutions passed to `chrome.i18n.getMessage`.
 */
export function t(key: string, substitutions?: string | string[]): string {
  const msg = chrome.i18n.getMessage(key, substitutions);
  return msg || key;
}

/**
 * Localize a DOM subtree in place:
 *   - `data-i18n="key"`         → set `textContent` to the localized message.
 *   - `data-i18n-attr="a:k,..."` → set attribute `a` to message `k`.
 * @param root The element/document to scan (defaults to `document`).
 */
export function applyI18n(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    const msg = t(key);
    if (msg) el.textContent = msg;
  });

  root.querySelectorAll<HTMLElement>("[data-i18n-attr]").forEach((el) => {
    const spec = el.dataset.i18nAttr;
    if (!spec) return;
    spec.split(",").forEach((pair) => {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (!attr || !key) return;
      const msg = t(key);
      if (msg) el.setAttribute(attr, msg);
    });
  });
}

/** Return the current browser UI language (e.g. `"ja"`, `"en-US"`). */
export function getUILang(): string {
  return chrome.i18n.getUILanguage();
}

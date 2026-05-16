export function t(key: string, substitutions?: string | string[]): string {
  const msg = chrome.i18n.getMessage(key, substitutions);
  return msg || key;
}

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

export function getUILang(): string {
  return chrome.i18n.getUILanguage();
}

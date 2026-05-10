import { defaultTheme } from "./defaults";

export function mergeTheme(themeJson: string): Record<string, string> {
  let parsed: Record<string, string> = {};
  try {
    const raw = JSON.parse(themeJson);
    if (raw && typeof raw === "object") parsed = raw;
  } catch { /* ignore — use defaults */ }
  return { ...defaultTheme, ...parsed };
}

export function applyTheme(target: HTMLElement, tokens: Record<string, string>) {
  for (const [k, v] of Object.entries(tokens)) {
    target.style.setProperty(`--${k}`, v);
  }
}

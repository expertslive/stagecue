import { useEffect } from "react";

/** Map from key (or code for Space) to handler. Letter keys are case-insensitive. */
export default function useShortcuts(map: Record<string, () => void>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      // Match by code first (Space) then by case-insensitive key.
      const codeMatch = map[e.code];
      if (codeMatch) { e.preventDefault(); codeMatch(); return; }
      const keyMatch = map[e.key] ?? map[e.key.toLowerCase()];
      if (keyMatch) { e.preventDefault(); keyMatch(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [map]);
}

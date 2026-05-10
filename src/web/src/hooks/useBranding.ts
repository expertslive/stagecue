import { useEffect, useState } from "react";
import { branding } from "@/api/branding";
import { applyTheme, mergeTheme } from "@/theme/applyTheme";

export function useBranding(code: string | undefined, scope: "r" | "e") {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [eventName, setEventName] = useState<string>("");

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    branding.getPublic(code, scope).then((info) => {
      if (cancelled) return;
      const tokens = mergeTheme(info.themeJson);
      applyTheme(document.documentElement, tokens);
      setLogoUrl(info.logoUrl);
      setEventName(info.eventName);
    }).catch(() => { /* fall back to defaults */ });
    return () => { cancelled = true; };
  }, [code, scope]);

  return { logoUrl, eventName };
}

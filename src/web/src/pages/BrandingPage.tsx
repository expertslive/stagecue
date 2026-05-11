import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { branding, type UpdateThemeBody } from "@/api/branding";
import ThemeTokenEditor from "@/components/branding/ThemeTokenEditor";
import ThresholdsEditor from "@/components/control/ThresholdsEditor";
import type { Threshold } from "@/api/types";
import SkeletonRow from "@/components/ui/SkeletonRow";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import SetupNav from "@/components/shell/SetupNav";
import { ChevronDown, ChevronRight, Upload } from "lucide-react";

export default function BrandingPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const qc = useQueryClient();
  const get = useQuery({ queryKey: ["branding", eventId], queryFn: () => branding.getEvent(eventId!), enabled: !!eventId });

  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [defaultThresholds, setDefaultThresholds] = useState<Threshold[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [logoVersion, setLogoVersion] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!get.data) return;
    try {
      const parsed = JSON.parse(get.data.themeJson);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOverrides(parsed && typeof parsed === "object" ? parsed : {});
    } catch {
      setOverrides({});
    }
    try {
      const parsed = JSON.parse(get.data.defaultThresholdsJson || "[]");
      setDefaultThresholds(Array.isArray(parsed) ? parsed : []);
    } catch {
      setDefaultThresholds([]);
    }
  }, [get.data]);

  const save = useMutation({
    mutationFn: (body: UpdateThemeBody) => branding.updateEvent(eventId!, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branding", eventId] }),
  });

  async function uploadLogo(file: File) {
    setError(null);
    const form = new FormData();
    form.set("file", file);
    const resp = await fetch(`/api/events/${eventId}/branding/logo`, { method: "POST", body: form, credentials: "include" });
    if (!resp.ok) { setError(`Upload failed (${resp.status})`); return; }
    setLogoVersion((n) => n + 1);
    qc.invalidateQueries({ queryKey: ["branding", eventId] });
  }

  const removeLogo = useMutation({
    mutationFn: () => branding.removeLogo(eventId!),
    onSuccess: () => { setLogoVersion((n) => n + 1); qc.invalidateQueries({ queryKey: ["branding", eventId] }); },
  });

  const accent = overrides["cta"] ?? "#0a84ff";

  function setAccent(value: string) {
    setOverrides((prev) => ({ ...prev, cta: value }));
  }

  function resetAccent() {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next.cta;
      return next;
    });
  }

  if (!eventId) return <div className="p-8 text-red-400">Missing event id.</div>;
  if (get.isLoading) return <div className="p-8 max-w-2xl mx-auto"><SkeletonRow count={3} /></div>;
  if (get.error) return <div className="p-8 text-red-400">Failed to load branding.</div>;

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <SetupNav eventId={eventId} />
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Branding</h1>
          <p className="mt-1 text-sm text-zinc-400">A logo and an accent colour. Everything else is derived from those.</p>
        </div>

        <Card density="comfortable">
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-zinc-200">Logo</h2>
            <div className="flex items-center gap-4">
              {get.data!.logoUrl ? (
                <div className="rounded-xl border border-white/10 bg-zinc-950/40 p-3">
                  <img src={`${get.data!.logoUrl}?v=${logoVersion}`} alt="" className="max-h-16 max-w-[180px]" />
                </div>
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-white/10 text-zinc-600">
                  <Upload className="size-5" />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="inline-flex">
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    className="sr-only"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }}
                  />
                  <span className="inline-flex cursor-pointer items-center rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700">
                    {get.data!.logoUrl ? "Replace logo" : "Upload logo"}
                  </span>
                </label>
                {get.data!.logoUrl && (
                  <Button size="sm" variant="ghost" onClick={() => removeLogo.mutate()}>Remove</Button>
                )}
              </div>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        </Card>

        <Card density="comfortable">
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-zinc-200">Accent colour</h2>
            <p className="text-sm text-zinc-400">
              Used for primary actions, links, and focus indicators across operator and audience surfaces.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="h-11 w-11 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                aria-label="Accent colour"
              />
              <input
                type="text"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="w-32 rounded-lg bg-zinc-950/60 border border-white/10 px-3 py-2 font-mono text-sm text-zinc-100 focus-visible:border-[var(--cta)]"
              />
              {overrides["cta"] !== undefined && (
                <Button size="sm" variant="ghost" onClick={resetAccent}>Reset</Button>
              )}
            </div>
          </div>
        </Card>

        <Card density="comfortable">
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-zinc-200">Default thresholds</h2>
            <p className="text-sm text-zinc-400">
              Schedule items inherit these colour cues unless they override them.
            </p>
            <ThresholdsEditor value={defaultThresholds} onChange={setDefaultThresholds} />
          </div>
        </Card>

        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200"
          >
            {showAdvanced ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            Advanced — per-token theme editor
          </button>
          {showAdvanced && (
            <div className="mt-4">
              <Card density="comfortable" tone="muted">
                <p className="mb-4 text-sm text-zinc-400">
                  Override individual tokens. Most teams should leave these alone — the accent colour above is enough.
                </p>
                <ThemeTokenEditor overrides={overrides} onChange={setOverrides} />
              </Card>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={() => save.mutate({
              themeJson: JSON.stringify(overrides),
              defaultThresholdsJson: JSON.stringify(defaultThresholds),
            })}
            disabled={save.isPending}
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
          {save.isSuccess && <span className="text-sm text-zinc-400">Saved</span>}
        </div>
      </div>
    </div>
  );
}

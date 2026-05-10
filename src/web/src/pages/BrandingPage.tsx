import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { branding, type UpdateThemeBody } from "@/api/branding";
import { defaultTheme } from "@/theme/defaults";

const tokenList = Object.keys(defaultTheme);

export default function BrandingPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const qc = useQueryClient();
  const get = useQuery({ queryKey: ["branding", eventId], queryFn: () => branding.getEvent(eventId!), enabled: !!eventId });

  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [thresholdsJson, setThresholdsJson] = useState<string>("[]");
  const [error, setError] = useState<string | null>(null);
  const [logoVersion, setLogoVersion] = useState(0);

  useEffect(() => {
    if (!get.data) return;
    try {
      const parsed = JSON.parse(get.data.themeJson);
      setOverrides(parsed && typeof parsed === "object" ? parsed : {});
    } catch { setOverrides({}); }
    setThresholdsJson(get.data.defaultThresholdsJson || "[]");
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

  if (!eventId) return <div className="p-8 text-red-400">Missing event id.</div>;
  if (get.isLoading) return <div className="p-8">Loading…</div>;
  if (get.error) return <div className="p-8 text-red-400">Failed to load branding.</div>;

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <Link to={`/events/${eventId}`} className="text-sm text-zinc-400 hover:text-zinc-200">← Event</Link>
      <h1 className="text-2xl font-semibold">Branding</h1>

      <section className="space-y-2">
        <h2 className="text-sm uppercase tracking-widest text-zinc-500">Logo</h2>
        {get.data!.logoUrl && (
          <div className="rounded border border-zinc-800 bg-zinc-900 p-4 inline-block">
            <img src={`${get.data!.logoUrl}?v=${logoVersion}`} alt="logo" className="max-h-24" />
          </div>
        )}
        <div className="flex gap-2 items-center">
          <input type="file" accept="image/png,image/svg+xml,image/jpeg"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
          {get.data!.logoUrl && (
            <button onClick={() => removeLogo.mutate()} className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sm">Remove</button>
          )}
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm uppercase tracking-widest text-zinc-500">Theme tokens</h2>
        <p className="text-xs text-zinc-500">Override only the tokens you want changed; the rest fall back to defaults.</p>
        <ul className="space-y-1">
          {tokenList.map((k) => (
            <li key={k} className="flex items-center gap-2">
              <label className="flex-1 text-sm">{k}</label>
              <input type="color" value={overrides[k] ?? defaultTheme[k]}
                onChange={(e) => setOverrides({ ...overrides, [k]: e.target.value })}
                className="w-12 h-8 rounded" />
              <input type="text" value={overrides[k] ?? ""}
                onChange={(e) => setOverrides({ ...overrides, [k]: e.target.value })}
                placeholder={defaultTheme[k]}
                className="w-28 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-xs font-mono" />
              {overrides[k] && (
                <button onClick={() => { const c = { ...overrides }; delete c[k]; setOverrides(c); }}
                  className="text-zinc-500 hover:text-zinc-300 text-xs px-1">×</button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm uppercase tracking-widest text-zinc-500">Default thresholds (JSON)</h2>
        <p className="text-xs text-zinc-500">Schedule items inherit these unless they define their own.</p>
        <textarea value={thresholdsJson} onChange={(e) => setThresholdsJson(e.target.value)}
          rows={6} className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 font-mono text-xs" />
      </section>

      <div className="flex gap-2">
        <button
          onClick={() => save.mutate({ themeJson: JSON.stringify(overrides), defaultThresholdsJson: thresholdsJson })}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm">
          {save.isPending ? "Saving…" : "Save"}
        </button>
        {save.isSuccess && <span className="text-sm text-green-400 self-center">Saved</span>}
      </div>
    </div>
  );
}

import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/api/auth";
import { useAuthStore } from "@/state/authStore";
import { deriveSlug } from "@/lib/slug";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Wordmark from "@/components/shell/Wordmark";

export default function SetupPage() {
  const nav = useNavigate();
  const setSignedIn = useAuthStore((s) => s.setSignedIn);
  const [orgName, setOrgName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerDisplayName, setOwnerDisplayName] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [slugOverride, setSlugOverride] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const tenantSlug = slugOverride ?? deriveSlug(orgName);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await auth.setupInitialize({
        tenantName: orgName,
        tenantSlug,
        ownerEmail,
        ownerPassword,
        ownerDisplayName,
      });
      await auth.signIn(ownerEmail, ownerPassword);
      setSignedIn(ownerEmail);
      nav("/");
    } catch (err) {
      setError((err as Error).message || "Setup failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Wordmark size="lg" />
          <p className="text-sm text-zinc-400">Set up your workspace and the first admin account.</p>
        </div>

        <Card density="comfortable">
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Organization name" value={orgName} onChange={setOrgName} required autoFocus />
            <Field label="Your email" type="email" value={ownerEmail} onChange={setOwnerEmail} required />
            <Field label="Choose a password" type="password" value={ownerPassword} onChange={setOwnerPassword} required />
            <Field label="Your name" value={ownerDisplayName} onChange={setOwnerDisplayName} required />

            <button
              type="button"
              onClick={() => setShowAdvanced((s) => !s)}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              {showAdvanced ? "Hide" : "Show"} advanced
            </button>
            {showAdvanced && (
              <Field
                label="Workspace address"
                value={tenantSlug}
                onChange={(v) => setSlugOverride(v)}
              />
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}
            <Button type="submit" disabled={submitting || !orgName || !ownerEmail || !ownerPassword} className="w-full">
              {submitting ? "Setting up…" : "Get started"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", required = false, autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  type?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-zinc-300 mb-1.5">{label}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} autoFocus={autoFocus}
        className="w-full rounded-lg bg-zinc-950/60 border border-white/10 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus-visible:border-[var(--cta)]"
      />
    </label>
  );
}

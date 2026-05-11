import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/api/auth";
import { useAuthStore } from "@/state/authStore";
import { deriveSlug } from "@/lib/slug";
import Button from "@/components/ui/Button";

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
      // Auto sign-in so the user lands on /events without re-entering credentials.
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
    <div className="max-w-md mx-auto p-8">
      <h1 className="text-2xl font-semibold mb-2">Welcome to Stagecue</h1>
      <p className="text-sm text-zinc-400 mb-6">Set up your organization and admin account to get started.</p>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Organization name" value={orgName} onChange={setOrgName} required autoFocus />
        <Field label="Your email" type="email" value={ownerEmail} onChange={setOwnerEmail} required />
        <Field label="Choose a password" type="password" value={ownerPassword} onChange={setOwnerPassword} required />
        <Field label="Your name" value={ownerDisplayName} onChange={setOwnerDisplayName} required />

        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          className="text-xs text-zinc-500 hover:text-zinc-300 underline"
        >
          {showAdvanced ? "Hide" : "Show"} advanced
        </button>
        {showAdvanced && (
          <Field
            label="URL identifier"
            value={tenantSlug}
            onChange={(v) => setSlugOverride(v)}
          />
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}
        <Button type="submit" disabled={submitting || !orgName || !ownerEmail || !ownerPassword} className="w-full">
          {submitting ? "Setting up…" : "Get started"}
        </Button>
      </form>
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
      <span className="block text-sm text-zinc-400 mb-1">{label}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} autoFocus={autoFocus}
        className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 focus-visible:outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30"
      />
    </label>
  );
}

import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/api/auth";

export default function SetupPage() {
  const nav = useNavigate();
  const [tenantName, setTenantName] = useState("My Org");
  const [tenantSlug, setTenantSlug] = useState("my-org");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerDisplayName, setOwnerDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await auth.setupInitialize({ tenantName, tenantSlug, ownerEmail, ownerPassword, ownerDisplayName });
      nav("/signin");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="max-w-md mx-auto p-8">
      <h1 className="text-2xl font-semibold mb-6">First-run setup</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Tenant name" value={tenantName} onChange={setTenantName} />
        <Field label="Tenant slug" value={tenantSlug} onChange={setTenantSlug} />
        <Field label="Owner email" type="email" value={ownerEmail} onChange={setOwnerEmail} />
        <Field label="Owner password" type="password" value={ownerPassword} onChange={setOwnerPassword} />
        <Field label="Display name" value={ownerDisplayName} onChange={setOwnerDisplayName} />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button type="submit" className="w-full py-2 px-4 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium">
          Initialize
        </button>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (s: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="block text-sm text-zinc-400 mb-1">{label}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 focus:outline-none focus:border-blue-500"
      />
    </label>
  );
}

import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/api/auth";
import { useAuthStore } from "@/state/authStore";
import { apiErrorMessage } from "@/lib/apiErrors";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Wordmark from "@/components/shell/Wordmark";

export default function SignInPage() {
  const nav = useNavigate();
  const setSignedIn = useAuthStore((s) => s.setSignedIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await auth.signIn(email, password);
      setSignedIn(email);
      nav("/");
    } catch (err) {
      setError(apiErrorMessage(err, "sign-in"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Wordmark size="lg" />
          <p className="text-sm text-zinc-400">Welcome back. Sign in to run the show.</p>
        </div>

        <Card density="comfortable">
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block">
              <span className="block text-sm font-medium text-zinc-300 mb-1.5">Email</span>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg bg-zinc-950/60 border border-white/10 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus-visible:border-[var(--cta)]"
                placeholder="you@example.com"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-zinc-300 mb-1.5">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg bg-zinc-950/60 border border-white/10 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus-visible:border-[var(--cta)]"
              />
            </label>
            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}
            <Button type="submit" disabled={submitting || !email || !password} className="w-full">
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

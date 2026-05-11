import { type FormEvent, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Wordmark from "@/components/shell/Wordmark";
import { passwordReset } from "@/api/members";
import { apiErrorMessage } from "@/lib/apiErrors";

/**
 * Landing page for the password-reset email link. Route: /reset-password/:userId/:token.
 * The link is single-use and time-limited (1 hour, set by Identity defaults).
 */
export default function ResetPasswordPage() {
  const { userId, token } = useParams<{ userId: string; token: string }>();
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!userId || !token) { setError("This reset link is malformed."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await passwordReset.apply(userId, decodeURIComponent(token), password);
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Wordmark size="lg" />
          {done
            ? <p className="text-sm text-zinc-400">Password updated. You can sign in with the new one.</p>
            : <p className="text-sm text-zinc-400">Choose a new password for your account.</p>}
        </div>

        {done ? (
          <Card density="comfortable">
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm text-zinc-300 text-center">
                Any other sessions you had open have been signed out for security.
              </p>
              <Button onClick={() => nav("/signin")} className="w-full">Go to sign-in</Button>
            </div>
          </Card>
        ) : (
          <Card density="comfortable">
            <form onSubmit={onSubmit} className="space-y-4">
              <label className="block">
                <span className="block text-sm font-medium text-zinc-300 mb-1.5">New password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  autoComplete="new-password"
                  required
                  className="w-full rounded-lg bg-zinc-950/60 border border-white/10 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus-visible:border-[var(--cta)]"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-zinc-300 mb-1.5">Confirm new password</span>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  className="w-full rounded-lg bg-zinc-950/60 border border-white/10 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus-visible:border-[var(--cta)]"
                />
              </label>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button type="submit" disabled={submitting || !password || !confirm} className="w-full">
                {submitting ? "Updating…" : "Set new password"}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}

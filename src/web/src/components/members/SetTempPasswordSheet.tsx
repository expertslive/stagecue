import { type FormEvent, useEffect, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import type { MemberDto } from "@/api/members";
import { Copy, Check } from "lucide-react";

interface Props {
  open: boolean;
  member: MemberDto | null;
  onClose: () => void;
  /** Caller does the mutation. After success we keep the sheet open so the admin can copy the temp password. */
  onSubmit: (newPassword: string) => Promise<void>;
}

/**
 * Two-phase Sheet: input phase asks for the password, success phase surfaces the value with a
 * Copy button so the admin can hand it off via Slack/email/text. The member is expected to
 * change it themselves once signed in.
 */
export default function SetTempPasswordSheet({ open, member, onClose, onSubmit }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setConfirm("");
    setError(null);
    setSubmitting(false);
    setCommitted(false);
    setCopied(false);
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!member) return;
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (password.length < 6) { setError("Use at least 6 characters."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(password);
      setCommitted(true);
    } catch (err) {
      setError((err as Error).message || "Could not set password.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  return (
    <Sheet open={open && member !== null} onClose={onClose} maxWidth="28rem">
      <h2 className="text-lg font-semibold text-zinc-100">
        {committed ? "Temporary password set" : "Set temporary password"}
      </h2>
      <p className="mt-1 text-sm text-zinc-400">
        {committed
          ? <>Share the password with <strong>{member?.email}</strong> via Slack, text, or in person. They'll be asked to change it after signing in.</>
          : <>Force-set a password for <strong>{member?.email}</strong>. They won't receive an email — you communicate it yourself.</>}
      </p>

      {!committed ? (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <label className="block">
            <span className="block text-sm font-medium text-zinc-300 mb-1.5">New password</span>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="new-password"
              className="w-full rounded-lg bg-zinc-950/60 border border-white/10 px-3 py-2 font-mono text-zinc-100 focus-visible:border-[var(--cta)]"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-zinc-300 mb-1.5">Confirm</span>
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg bg-zinc-950/60 border border-white/10 px-3 py-2 font-mono text-zinc-100 focus-visible:border-[var(--cta)]"
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting || !password || !confirm}>
              {submitting ? "Setting…" : "Set password"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2">
            <code className="flex-1 font-mono text-zinc-100">{password}</code>
            <button
              type="button"
              onClick={copy}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
              aria-label={copied ? "Copied" : "Copy password"}
            >
              {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            This is the last time we'll show this value. After you close, it's not stored anywhere we can retrieve.
          </p>
          <div className="flex justify-end pt-2">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

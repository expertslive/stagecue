import { type FormEvent, useEffect, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import type { MemberDto } from "@/api/members";

interface Props {
  open: boolean;
  member: MemberDto | null;
  onClose: () => void;
  /** Caller does the mutation. Receives only the changed fields (or both — server tolerates idempotent). */
  onSubmit: (values: { displayName: string | null; email: string }) => Promise<void>;
}

export default function EditMemberSheet({ open, member, onClose, onSubmit }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !member) return;
    setDisplayName(member.displayName ?? "");
    setEmail(member.email);
    setError(null);
    setSubmitting(false);
  }, [open, member]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!member) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        displayName: displayName.trim() === "" ? null : displayName.trim(),
        email: email.trim(),
      });
      onClose();
    } catch (err) {
      setError((err as Error).message || "Could not save profile.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open && member !== null} onClose={onClose} onConfirm={() => undefined} maxWidth="28rem">
      <h2 className="text-lg font-semibold text-zinc-100">Edit profile</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Changes apply to the member's account. Email changes update the sign-in identifier and force a re-sign-in.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <label className="block">
          <span className="block text-sm font-medium text-zinc-300 mb-1.5">Display name</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Leave blank to clear"
            className="w-full rounded-lg bg-zinc-950/60 border border-white/10 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus-visible:border-[var(--cta)]"
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-zinc-300 mb-1.5">Email (sign-in identifier)</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg bg-zinc-950/60 border border-white/10 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus-visible:border-[var(--cta)]"
          />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save changes"}</Button>
        </div>
      </form>
    </Sheet>
  );
}

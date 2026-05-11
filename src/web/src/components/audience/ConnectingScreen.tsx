import Wordmark from "@/components/shell/Wordmark";

interface Props {
  /** What we're connecting to. */
  target: string;
  /** Optional error message — if present we show it and a helpful instruction. */
  error?: string | null;
}

export default function ConnectingScreen({ target, error }: Props) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-6">
      <Wordmark size="lg" />
      {!error ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span
            aria-hidden="true"
            className="size-1.5 animate-pulse rounded-full"
            style={{ background: "var(--cta)" }}
          />
          <span>Connecting to {target}…</span>
        </div>
      ) : (
        <div className="max-w-md text-center space-y-2">
          <div className="text-sm text-red-400">We can't connect right now.</div>
          <div className="text-sm text-zinc-500">
            Check the code printed on your QR card, or ask the event organiser for a fresh one.
          </div>
        </div>
      )}
    </div>
  );
}

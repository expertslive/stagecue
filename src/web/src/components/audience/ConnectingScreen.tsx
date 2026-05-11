interface Props {
  /** What we're connecting to. */
  target: string;
  /** Optional error message — if present we show it and a helpful instruction. */
  error?: string | null;
}

export default function ConnectingScreen({ target, error }: Props) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <div className="text-3xl font-semibold tracking-tight">Stagecue</div>
      {!error ? (
        <div className="flex items-center gap-2 text-zinc-400">
          <span className="size-2 animate-pulse rounded-full bg-zinc-500" />
          <span>Connecting to {target}…</span>
        </div>
      ) : (
        <div className="max-w-md text-center">
          <div className="text-red-400">We can't connect right now.</div>
          <div className="mt-2 text-sm text-zinc-500">
            Check the code printed on your QR card, or ask the event organiser for a fresh one.
          </div>
        </div>
      )}
    </div>
  );
}

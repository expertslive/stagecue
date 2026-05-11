import { Gauge, Square } from "lucide-react";
import Button from "@/components/ui/Button";

export default function RehearsalControls({
  enabled,
  speed,
  onStart,
  onStop,
}: {
  enabled: boolean;
  speed: number;
  onStart: (speed: number) => void;
  onStop: () => void;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${
      enabled ? "border-[var(--cta)]/30 bg-[var(--cta)]/10" : "border-white/5 bg-zinc-900/50"
    }`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <Gauge className="size-4 text-[color:var(--cta)]" />
            Rehearsal clock
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            Local preview only. Public screens and the server timer are unchanged.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[2, 5, 10].map((nextSpeed) => (
            <Button
              key={nextSpeed}
              size="sm"
              variant={enabled && speed === nextSpeed ? "primary" : "secondary"}
              onClick={() => onStart(nextSpeed)}
            >
              {nextSpeed}x
            </Button>
          ))}
          {enabled && (
            <Button size="sm" variant="ghost" leadingIcon={<Square className="size-3" />} onClick={onStop}>
              Stop
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

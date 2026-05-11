import type { SnapshotNextItem } from "@/api/types";

export default function SessionFooter({ next }: { next: SnapshotNextItem | null }) {
  if (!next) return null;
  return (
    <div className="absolute bottom-6 left-8 right-8 text-base text-zinc-400">
      Next · {next.title} · {new Date(next.scheduledStartUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </div>
  );
}

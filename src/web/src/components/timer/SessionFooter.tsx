import type { SnapshotNextItem } from "@/api/types";

export default function SessionFooter({ next }: { next: SnapshotNextItem | null }) {
  if (!next) return null;
  return (
    <div className="absolute bottom-3 left-6 right-6 text-xs text-zinc-600">
      Next: {next.title} ({new Date(next.scheduledStartUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
    </div>
  );
}

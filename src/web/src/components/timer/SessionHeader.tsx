import type { SnapshotItem } from "@/api/types";

export default function SessionHeader({ item }: { item: SnapshotItem | null }) {
  if (!item) return <div className="h-8" />;
  return (
    <div className="absolute top-4 left-6 right-6 flex justify-between text-sm text-zinc-500">
      <span>Now: {item.title}</span>
      {item.speakerName && <span>{item.speakerName}</span>}
    </div>
  );
}

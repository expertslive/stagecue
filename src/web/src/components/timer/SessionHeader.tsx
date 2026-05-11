import type { SnapshotItem } from "@/api/types";

export default function SessionHeader({ item }: { item: SnapshotItem | null }) {
  if (!item) return <div className="h-12" />;
  return (
    <div className="absolute top-6 left-8 right-8 flex flex-wrap items-baseline justify-between gap-2 text-zinc-300">
      <span className="text-2xl font-medium">{item.title}</span>
      {item.speakerName && <span className="text-lg text-zinc-400">{item.speakerName}</span>}
    </div>
  );
}

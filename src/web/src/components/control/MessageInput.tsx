import type { Snapshot } from "@/api/types";
import type { TimerHub } from "@/hub/timerHub";
import { useState } from "react";
import { humaniseHubError } from "@/lib/hubErrors";

const presets = ["Wrap up", "5 min over", "Q&A time", "Mic check"];

export default function MessageInput({ hub, snapshot, onError }: { hub: TimerHub | null; snapshot: Snapshot; onError?: (e: string) => void }) {
  const [draft, setDraft] = useState("");
  if (!hub) return null;
  const handle = (p: Promise<unknown>) => p.catch((e) => onError?.(humaniseHubError(e)));

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder={snapshot.currentMessage ? `Currently: ${snapshot.currentMessage}` : "Type a message"}
          className="flex-1 px-3 py-2 rounded bg-zinc-900 border border-zinc-800" />
        <button
          onClick={() => { handle(hub.setMessage(snapshot.roomId, draft.trim() || null)); setDraft(""); }}
          className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm">Send</button>
        <button
          onClick={() => handle(hub.clearMessage(snapshot.roomId))}
          className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm">Clear</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button key={p}
            onClick={() => handle(hub.setMessage(snapshot.roomId, p))}
            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs">{p}</button>
        ))}
      </div>
    </div>
  );
}

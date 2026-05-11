import { forwardRef, useState } from "react";
import { X } from "lucide-react";
import type { Snapshot } from "@/api/types";
import type { TimerHub } from "@/hub/timerHub";
import { humaniseHubError } from "@/lib/hubErrors";
import Button from "@/components/ui/Button";

const presets = ["Wrap up", "5 min over", "Q&A time", "Mic check"];

const MessageInput = forwardRef<HTMLInputElement, { hub: TimerHub | null; snapshot: Snapshot; onError?: (e: string) => void }>(
  function MessageInput({ hub, snapshot, onError }, ref) {
    const [draft, setDraft] = useState("");
    if (!hub) return null;
    const handle = (p: Promise<unknown>) => p.catch((e) => onError?.(humaniseHubError(e)));
    const current = snapshot.currentMessage;
    const send = (text: string) => handle(hub.setMessage(snapshot.roomId, text || null));
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            ref={ref}
            value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message to display on the speaker screen"
            className="flex-1 px-3 py-2 rounded bg-zinc-950/60 border border-white/10"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(draft.trim()); } }}
          />
          <Button onClick={() => send(draft.trim())} disabled={!draft.trim()}>
            Send
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <Button key={p} variant="secondary" size="sm" onClick={() => send(p)}>
              {p}
            </Button>
          ))}
        </div>
        {current ? (
          <div
            role="status"
            className="flex items-center gap-3 rounded-xl border border-white/5 bg-zinc-900/60 backdrop-blur-sm px-3 py-2 text-sm"
          >
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ background: "var(--message-bg)" }}
            />
            <span className="text-zinc-400">On speaker screen:</span>
            <span className="flex-1 truncate text-zinc-100" title={current}>
              {current}
            </span>
            <button
              type="button"
              onClick={() => handle(hub.clearMessage(snapshot.roomId))}
              aria-label="Clear message from speaker screen"
              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">No message is being displayed.</p>
        )}
      </div>
    );
  },
);

export default MessageInput;

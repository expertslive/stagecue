import { useEffect, useMemo, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import type { RoomDto } from "@/api/types";
import {
  DEFAULT_DOOR_CONFIG,
  parseDoorConfig,
  serializeDoorConfig,
  type DoorDisplayConfig,
  type DoorOrientation,
} from "@/lib/doorDisplayConfig";

interface Props {
  open: boolean;
  room: RoomDto | null;
  onClose: () => void;
  onSubmit: (json: string) => Promise<void>;
}

interface FieldSpec {
  key: keyof DoorDisplayConfig;
  label: string;
  hint?: string;
  /** If set, this field is only meaningful when the parent field is enabled. */
  parent?: keyof DoorDisplayConfig;
}

const FIELDS: FieldSpec[] = [
  { key: "showEventName", label: "Event name", hint: "Small label at the top." },
  { key: "showRoomName", label: "Room name", hint: "Large headline." },
  { key: "showLogo", label: "Event logo", hint: "Pulled from event branding." },
  { key: "showNowPlaying", label: "Now playing section" },
  { key: "showSpeakerName", label: "  Speaker name", parent: "showNowPlaying" },
  { key: "showCountdown", label: "  Countdown / status", hint: "e.g. '5:42 remaining' or 'Paused'.", parent: "showNowPlaying" },
  { key: "showUpNext", label: "Up next section" },
  { key: "showUpNextTime", label: "  Scheduled start time", parent: "showUpNext" },
];

export default function DoorDisplaySettingsSheet({ open, room, onClose, onSubmit }: Props) {
  const initial = useMemo(() => parseDoorConfig(room?.doorDisplayConfigJson), [room]);
  const [config, setConfig] = useState<DoorDisplayConfig>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !room) return;
    setConfig(parseDoorConfig(room.doorDisplayConfigJson));
    setSubmitting(false);
    setError(null);
  }, [open, room]);

  function update<K extends keyof DoorDisplayConfig>(key: K, value: DoorDisplayConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(serializeDoorConfig(config));
      onClose();
    } catch (e) {
      setError((e as Error).message || "Could not save.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open && room !== null} onClose={onClose} onConfirm={handleSave} maxWidth="32rem">
      <h2 className="text-lg font-semibold text-zinc-100">Door display</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Controls the public screen at <strong>{room?.name}</strong> (the URL ending in <code className="font-mono">/door</code>). Changes apply on next refresh of that display.
      </p>

      <div className="mt-5 space-y-5">
        <section>
          <h3 className="text-sm font-semibold text-zinc-300 mb-2">Orientation</h3>
          <div className="grid grid-cols-2 gap-2">
            <OrientationOption
              value="landscape"
              current={config.orientation}
              onSelect={(o) => update("orientation", o)}
              label="Landscape"
              caption="Wider than tall (default)"
            />
            <OrientationOption
              value="portrait"
              current={config.orientation}
              onSelect={(o) => update("orientation", o)}
              label="Portrait"
              caption="Taller than wide"
            />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-zinc-300 mb-2">Show on screen</h3>
          <ul className="space-y-1 rounded-xl border border-white/5 bg-zinc-950/30 p-2">
            {FIELDS.map((f) => {
              const disabled = f.parent ? !config[f.parent] : false;
              const indented = !!f.parent;
              return (
                <li key={f.key} className={indented ? "pl-4" : ""}>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2 ${disabled ? "opacity-40" : "hover:bg-white/[0.04]"}`}>
                    <input
                      type="checkbox"
                      checked={!!config[f.key]}
                      disabled={disabled}
                      onChange={(e) => update(f.key, e.target.checked as DoorDisplayConfig[typeof f.key])}
                      className="mt-0.5 size-4 cursor-pointer accent-[var(--cta)]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-zinc-200">{f.label.trimStart()}</div>
                      {f.hint && <div className="text-xs text-zinc-500">{f.hint}</div>}
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => setConfig(DEFAULT_DOOR_CONFIG)}
            className="mt-2 text-xs text-zinc-500 hover:text-zinc-300"
          >
            Reset to defaults
          </button>
        </section>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

interface OrientationOptionProps {
  value: DoorOrientation;
  current: DoorOrientation;
  onSelect: (o: DoorOrientation) => void;
  label: string;
  caption: string;
}

function OrientationOption({ value, current, onSelect, label, caption }: OrientationOptionProps) {
  const active = value === current;
  const isLandscape = value === "landscape";
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={active}
      className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-left transition-colors ${
        active
          ? "border-[var(--cta)] bg-[var(--cta)]/10"
          : "border-white/10 bg-zinc-950/30 hover:bg-white/[0.04]"
      }`}
    >
      <div
        aria-hidden="true"
        className={`rounded-md border ${active ? "border-[var(--cta)]" : "border-white/20"}`}
        style={{
          width: isLandscape ? 56 : 32,
          height: isLandscape ? 32 : 56,
        }}
      />
      <div className="text-center">
        <div className="text-sm font-medium text-zinc-100">{label}</div>
        <div className="text-xs text-zinc-500">{caption}</div>
      </div>
    </button>
  );
}

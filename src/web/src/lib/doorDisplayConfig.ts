/**
 * Shape of the per-room Door display configuration. Stored as opaque JSON on the server
 * (Room.DoorDisplayConfigJson) and surfaced via the public /r/{code}/info endpoint so the
 * DoorView can read it without auth. Defaults match the historical layout.
 */
export type DoorOrientation = "landscape" | "portrait";

export interface DoorDisplayConfig {
  orientation: DoorOrientation;
  showEventName: boolean;
  showRoomName: boolean;
  showNowPlaying: boolean;
  showSpeakerName: boolean;
  showCountdown: boolean;
  showUpNext: boolean;
  showUpNextTime: boolean;
  showLogo: boolean;
}

export const DEFAULT_DOOR_CONFIG: DoorDisplayConfig = {
  orientation: "landscape",
  showEventName: true,
  showRoomName: true,
  showNowPlaying: true,
  showSpeakerName: true,
  showCountdown: true,
  showUpNext: true,
  showUpNextTime: true,
  showLogo: true,
};

/** Parse a JSON string into a config, merging missing keys from the defaults. */
export function parseDoorConfig(json: string | null | undefined): DoorDisplayConfig {
  if (!json) return DEFAULT_DOOR_CONFIG;
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return DEFAULT_DOOR_CONFIG;
    return { ...DEFAULT_DOOR_CONFIG, ...parsed };
  } catch {
    return DEFAULT_DOOR_CONFIG;
  }
}

export function serializeDoorConfig(c: DoorDisplayConfig): string {
  return JSON.stringify(c);
}

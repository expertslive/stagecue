import type { EventRoleName } from "@/api/members";

const LABELS: Record<EventRoleName, string> = {
  EventAdmin: "Event admin",
  RoomOperator: "Room operator",
  Viewer: "Viewer",
};

const DESCRIPTIONS: Record<EventRoleName, string> = {
  EventAdmin: "Can manage the event, rooms, members and settings.",
  RoomOperator: "Can control the timer in assigned rooms during the event.",
  Viewer: "Read-only access to the event and its rooms.",
};

export function roleLabel(role: EventRoleName): string {
  return LABELS[role];
}

export function roleDescription(role: EventRoleName): string {
  return DESCRIPTIONS[role];
}

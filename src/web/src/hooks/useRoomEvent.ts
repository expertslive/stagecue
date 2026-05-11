import { useQueries, useQuery } from "@tanstack/react-query";
import { events } from "@/api/events";
import type { EventDto, RoomDto } from "@/api/types";

/**
 * Resolve the event/room pair for a given roomId by scanning the events list and
 * each event's rooms. Heavily cache-friendly: if the user reached `/rooms/:id` from
 * the event dashboard, both queries are already warm. Returns `undefined` for
 * either field while the lookup is pending or if no match exists.
 */
export function useRoomEvent(roomId: string | undefined): {
  event?: EventDto;
  room?: RoomDto;
  isLoading: boolean;
} {
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: events.list, enabled: !!roomId });

  const roomQueries = useQueries({
    queries: (eventsQuery.data ?? []).map((ev) => ({
      queryKey: ["rooms", ev.id],
      queryFn: () => events.rooms(ev.id),
      enabled: !!roomId,
    })),
  });

  const isLoading =
    !!roomId && (eventsQuery.isLoading || roomQueries.some((q) => q.isLoading));

  if (!roomId) return { isLoading: false };

  for (let i = 0; i < roomQueries.length; i++) {
    const rooms = roomQueries[i].data;
    if (!rooms) continue;
    const room = rooms.find((r) => r.id === roomId);
    if (room) return { event: eventsQuery.data![i], room, isLoading: false };
  }
  return { isLoading };
}

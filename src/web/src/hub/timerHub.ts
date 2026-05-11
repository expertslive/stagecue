import { HubConnection, HubConnectionBuilder, HttpTransportType, LogLevel, HubConnectionState } from "@microsoft/signalr";
import type { Snapshot } from "@/api/types";

export type SnapshotListener = (snapshot: Snapshot) => void;
export type MessageListener = (roomId: string, message: string | null) => void;
export interface RoomDisplayPresence { speaker: number; door: number; other: number }
export interface DisplayPresence { lobby: number; rooms: Record<string, RoomDisplayPresence> }
export type PresenceListener = (eventId: string, presence: DisplayPresence) => void;

/**
 * Coarse-grained connection state exposed to UI:
 * - "connecting" — initial start in progress
 * - "connected" — hub is up, snapshots flowing
 * - "reconnecting" — socket dropped; SignalR is retrying in the background
 * - "disconnected" — never connected, or stopped intentionally
 */
export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";
export type ConnectionListener = (state: ConnectionState) => void;

export class TimerHub {
  private conn: HubConnection;
  private snapshotListeners = new Set<SnapshotListener>();
  private messageListeners = new Set<MessageListener>();
  private presenceListeners = new Set<PresenceListener>();
  private connectionListeners = new Set<ConnectionListener>();
  private currentState: ConnectionState = "disconnected";

  /**
   * @param accessCode 8-char public access code (no dash). Pass null for cookie-authenticated operators.
   * @param surface Optional audience surface marker for presence accounting.
   * @param logLevel SignalR client log level. Default Warning; pass `LogLevel.Critical` for
   *   read-only multi-room dashboards where authorised-room rejections are expected and we
   *   surface real failures through our own state instead.
   */
  constructor(accessCode: string | null, surface?: "speaker" | "door" | "lobby", logLevel: LogLevel = LogLevel.Warning) {
    const query = new URLSearchParams();
    if (accessCode) query.set("code", accessCode);
    if (surface) query.set("surface", surface);
    const qs = query.toString();
    const url = qs ? `/hub/timer?${qs}` : "/hub/timer";
    this.conn = new HubConnectionBuilder()
      .withUrl(url, {
        transport: HttpTransportType.WebSockets | HttpTransportType.ServerSentEvents | HttpTransportType.LongPolling,
      })
      // Default policy gives up after 4 attempts (0s, 2s, 10s, 30s — ~42s total). For live
      // events with intermittent venue Wi-Fi, keep trying with growing backoff and never
      // give up. Returning a number from nextRetryDelayInMilliseconds tells the client to
      // keep retrying; returning null stops it.
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (ctx) => {
          const seconds = ctx.elapsedMilliseconds / 1000;
          if (seconds < 60) return 2000;     // 0–60s: every 2s
          if (seconds < 300) return 10000;   // 1–5min: every 10s
          return 30000;                      // 5min+: every 30s, forever
        },
      })
      .configureLogging(logLevel)
      .build();

    this.conn.on("RoomStateChanged", (snap: Snapshot) => {
      this.snapshotListeners.forEach((l) => l(snap));
    });
    this.conn.on("MessageChanged", (payload: { roomId: string; message: string | null }) => {
      this.messageListeners.forEach((l) => l(payload.roomId, payload.message));
    });
    this.conn.on("DisplayPresenceChanged", (eventId: string, presence: DisplayPresence) => {
      this.presenceListeners.forEach((l) => l(eventId, presence));
    });

    // Connection lifecycle hooks. SignalR's auto-reconnect fires onreconnecting on drop,
    // onreconnected on success, onclose on a give-up; we map those to our coarse state.
    this.conn.onreconnecting(() => this.setState("reconnecting"));
    this.conn.onreconnected(() => this.setState("connected"));
    this.conn.onclose(() => this.setState("disconnected"));
  }

  get state(): ConnectionState { return this.currentState; }

  private setState(next: ConnectionState) {
    if (this.currentState === next) return;
    this.currentState = next;
    this.connectionListeners.forEach((l) => l(next));
  }

  async start() {
    this.setState("connecting");
    try {
      await this.conn.start();
      this.setState("connected");
    } catch (e) {
      this.setState("disconnected");
      throw e;
    }
  }

  stop() { return this.conn.stop(); }

  onSnapshot(l: SnapshotListener) { this.snapshotListeners.add(l); return () => this.snapshotListeners.delete(l); }
  onMessage(l: MessageListener) { this.messageListeners.add(l); return () => this.messageListeners.delete(l); }
  onPresence(l: PresenceListener) { this.presenceListeners.add(l); return () => this.presenceListeners.delete(l); }
  onConnectionChange(l: ConnectionListener) {
    this.connectionListeners.add(l);
    // Fire current state immediately so consumers don't have to wait for the next transition.
    l(this.currentState);
    return () => this.connectionListeners.delete(l);
  }

  /** True only when the underlying connection is healthy enough to invoke methods. */
  isConnected(): boolean {
    return this.conn.state === HubConnectionState.Connected;
  }

  resync(roomId: string) { return this.conn.invoke<Snapshot | null>("Resync", roomId); }
  getPresenceForEvent(eventId: string) { return this.conn.invoke<DisplayPresence>("GetPresenceForEvent", eventId); }

  startAuto(roomId: string, version: number) { return this.invokeVersioned<Snapshot>("StartAuto", roomId, version); }
  startItem(roomId: string, scheduleItemId: string, version: number) { return this.invokeVersioned<Snapshot>("StartItem", roomId, scheduleItemId, version); }
  pause(roomId: string, version: number) { return this.invokeVersioned<Snapshot>("Pause", roomId, version); }
  resume(roomId: string, version: number) { return this.invokeVersioned<Snapshot>("Resume", roomId, version); }
  stopRoom(roomId: string, version: number) { return this.invokeVersioned<Snapshot>("Stop", roomId, version); }
  reset(roomId: string, version: number) { return this.invokeVersioned<Snapshot>("Reset", roomId, version); }
  skipNext(roomId: string, version: number) { return this.invokeVersioned<Snapshot>("SkipNext", roomId, version); }
  adjustTime(roomId: string, deltaSec: number, version: number) { return this.invokeVersioned<Snapshot>("AdjustTime", roomId, deltaSec, version); }
  setExactRemaining(roomId: string, remainingSec: number, version: number) { return this.invokeVersioned<Snapshot>("SetExactRemaining", roomId, remainingSec, version); }

  setMessage(roomId: string, message: string | null) { return this.conn.invoke<Snapshot>("SetMessage", roomId, message); }
  clearMessage(roomId: string) { return this.conn.invoke<Snapshot>("ClearMessage", roomId); }

  /**
   * Invokes a hub method whose last argument is `version`. On StaleVersion (another operator
   * mutated state between our snapshot and our invoke), resync once and retry with the fresh
   * version. The refreshed snapshot is fanned out to listeners so the UI follows.
   */
  private async invokeVersioned<T>(method: string, roomId: string, ...trailing: unknown[]): Promise<T> {
    try {
      return await this.conn.invoke<T>(method, roomId, ...trailing);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (!msg.includes("StaleVersion")) throw e;
      const fresh = await this.conn.invoke<Snapshot | null>("Resync", roomId);
      if (!fresh) throw e;
      this.snapshotListeners.forEach((l) => l(fresh));
      const newTrailing = [...trailing.slice(0, -1), fresh.version];
      return await this.conn.invoke<T>(method, roomId, ...newTrailing);
    }
  }
}

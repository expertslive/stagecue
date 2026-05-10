import { HubConnection, HubConnectionBuilder, HttpTransportType, LogLevel } from "@microsoft/signalr";
import type { Snapshot } from "@/api/types";

export type SnapshotListener = (snapshot: Snapshot) => void;
export type MessageListener = (roomId: string, message: string | null) => void;

export class TimerHub {
  private conn: HubConnection;
  private snapshotListeners = new Set<SnapshotListener>();
  private messageListeners = new Set<MessageListener>();

  /**
   * @param accessCode 8-char public access code (no dash). Pass null for cookie-authenticated operators.
   */
  constructor(accessCode: string | null) {
    const url = accessCode ? `/hub/timer?code=${encodeURIComponent(accessCode)}` : "/hub/timer";
    this.conn = new HubConnectionBuilder()
      .withUrl(url, {
        transport: HttpTransportType.WebSockets | HttpTransportType.ServerSentEvents | HttpTransportType.LongPolling,
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    this.conn.on("RoomStateChanged", (snap: Snapshot) => {
      this.snapshotListeners.forEach((l) => l(snap));
    });
    this.conn.on("MessageChanged", (payload: { roomId: string; message: string | null }) => {
      this.messageListeners.forEach((l) => l(payload.roomId, payload.message));
    });
  }

  start() { return this.conn.start(); }
  stop() { return this.conn.stop(); }

  onSnapshot(l: SnapshotListener) { this.snapshotListeners.add(l); return () => this.snapshotListeners.delete(l); }
  onMessage(l: MessageListener) { this.messageListeners.add(l); return () => this.messageListeners.delete(l); }

  resync(roomId: string) { return this.conn.invoke<Snapshot | null>("Resync", roomId); }

  startAuto(roomId: string, version: number) { return this.conn.invoke<Snapshot>("StartAuto", roomId, version); }
  startItem(roomId: string, scheduleItemId: string, version: number) { return this.conn.invoke<Snapshot>("StartItem", roomId, scheduleItemId, version); }
  pause(roomId: string, version: number) { return this.conn.invoke<Snapshot>("Pause", roomId, version); }
  resume(roomId: string, version: number) { return this.conn.invoke<Snapshot>("Resume", roomId, version); }
  stopRoom(roomId: string, version: number) { return this.conn.invoke<Snapshot>("Stop", roomId, version); }
  reset(roomId: string, version: number) { return this.conn.invoke<Snapshot>("Reset", roomId, version); }
  skipNext(roomId: string, version: number) { return this.conn.invoke<Snapshot>("SkipNext", roomId, version); }
  adjustTime(roomId: string, deltaSec: number, version: number) { return this.conn.invoke<Snapshot>("AdjustTime", roomId, deltaSec, version); }
  setExactRemaining(roomId: string, remainingSec: number, version: number) { return this.conn.invoke<Snapshot>("SetExactRemaining", roomId, remainingSec, version); }

  setMessage(roomId: string, message: string | null) { return this.conn.invoke<Snapshot>("SetMessage", roomId, message); }
  clearMessage(roomId: string) { return this.conn.invoke<Snapshot>("ClearMessage", roomId); }
}

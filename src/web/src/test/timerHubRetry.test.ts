import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Snapshot } from "@/api/types";

// We test the retry behavior by mocking the underlying HubConnection.
// The TimerHub constructor builds a real HubConnection via HubConnectionBuilder,
// so we stub the @microsoft/signalr module before importing the class.
const invokeMock = vi.fn();

vi.mock("@microsoft/signalr", () => {
  class FakeBuilder {
    withUrl() { return this; }
    withAutomaticReconnect() { return this; }
    configureLogging() { return this; }
    build() {
      return {
        invoke: invokeMock,
        on: () => {},
        onreconnecting: () => {},
        onreconnected: () => {},
        onclose: () => {},
        start: () => Promise.resolve(),
        stop: () => Promise.resolve(),
        state: "Connected",
      };
    }
  }
  return {
    HubConnectionBuilder: FakeBuilder,
    HttpTransportType: { WebSockets: 1, ServerSentEvents: 2, LongPolling: 4 },
    LogLevel: { Warning: 3, Critical: 5 },
    HubConnectionState: { Disconnected: "Disconnected", Connecting: "Connecting", Connected: "Connected", Disconnecting: "Disconnecting", Reconnecting: "Reconnecting" },
  };
});

import { TimerHub } from "@/hub/timerHub";

function snap(version: number): Snapshot {
  return {
    roomId: "r1", currentItem: null, currentRunId: null, nextItem: null,
    phase: "Idle", startedAtUtc: null, preRollEndsAtUtc: null, pauseStartedAtUtc: null,
    pausedAccumSec: 0, adjustmentSec: 0, pauseRemainingMs: null,
    currentMessage: null, serverNowUtc: new Date().toISOString(), version,
  };
}

describe("TimerHub.invokeVersioned retry", () => {
  beforeEach(() => invokeMock.mockReset());

  it("retries once with the fresh version on StaleVersion", async () => {
    invokeMock
      .mockRejectedValueOnce(new Error("HubException: StaleVersion"))
      .mockResolvedValueOnce(snap(7))   // Resync
      .mockResolvedValueOnce(snap(8));  // retry succeeds

    const hub = new TimerHub(null);
    const listener = vi.fn();
    hub.onSnapshot(listener);

    const result = await hub.pause("r1", 5);
    expect(result.version).toBe(8);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "Pause", "r1", 5);
    expect(invokeMock).toHaveBeenNthCalledWith(2, "Resync", "r1");
    expect(invokeMock).toHaveBeenNthCalledWith(3, "Pause", "r1", 7);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].version).toBe(7);
  });

  it("substitutes only the last argument when there are extra args (StartItem)", async () => {
    invokeMock
      .mockRejectedValueOnce(new Error("HubException: StaleVersion"))
      .mockResolvedValueOnce(snap(10))
      .mockResolvedValueOnce(snap(11));

    const hub = new TimerHub(null);
    await hub.startItem("r1", "item-1", 4);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "StartItem", "r1", "item-1", 4);
    expect(invokeMock).toHaveBeenNthCalledWith(2, "Resync", "r1");
    expect(invokeMock).toHaveBeenNthCalledWith(3, "StartItem", "r1", "item-1", 10);
  });

  it("does not retry on errors other than StaleVersion", async () => {
    invokeMock.mockRejectedValueOnce(new Error("HubException: InvalidPhase"));

    const hub = new TimerHub(null);
    await expect(hub.pause("r1", 5)).rejects.toThrow(/InvalidPhase/);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("propagates the retry failure if the second attempt also fails", async () => {
    invokeMock
      .mockRejectedValueOnce(new Error("HubException: StaleVersion"))
      .mockResolvedValueOnce(snap(7))
      .mockRejectedValueOnce(new Error("HubException: InvalidPhase"));

    const hub = new TimerHub(null);
    await expect(hub.pause("r1", 5)).rejects.toThrow(/InvalidPhase/);
    expect(invokeMock).toHaveBeenCalledTimes(3);
  });
});

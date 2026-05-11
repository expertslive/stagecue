import { forwardRef, useEffect } from "react";
import type { Ref } from "react";
import type { Snapshot, ScheduleItemDto } from "@/api/types";
import type { TimerHub } from "@/hub/timerHub";
import Card from "@/components/ui/Card";
import Tabs, { type TabSpec } from "@/components/ui/Tabs";
import TimeAdjustments from "./TimeAdjustments";
import MessageInput from "./MessageInput";
import ScheduleList from "./ScheduleList";

export type ToolsTabId = "adjust" | "message" | "schedule";

interface Props {
  hub: TimerHub | null;
  snapshot: Snapshot;
  activeTab: ToolsTabId;
  onTabChange: (id: ToolsTabId) => void;
  scheduleItems?: ScheduleItemDto[];
  /** When true, the Schedule tab is rendered inside the panel (narrow viewports). */
  includeScheduleTab?: boolean;
  onError?: (e: string) => void;
}

const ToolsPanel = forwardRef(function ToolsPanel(
  { hub, snapshot, activeTab, onTabChange, scheduleItems, includeScheduleTab = false, onError }: Props,
  messageInputRef: Ref<HTMLInputElement>,
) {
  const adjustable = snapshot.phase === "Running" || snapshot.phase === "Paused";

  // If the phase changes such that the current tab becomes disabled, fall through.
  useEffect(() => {
    if (activeTab === "adjust" && !adjustable) onTabChange("message");
  }, [activeTab, adjustable, onTabChange]);

  const tabs: TabSpec[] = [
    { id: "adjust", label: "Adjust time", disabled: !adjustable },
    { id: "message", label: "Message" },
    ...(includeScheduleTab ? [{ id: "schedule", label: "Schedule" } as TabSpec] : []),
  ];

  return (
    <Card density="comfortable" className="space-y-4">
      <Tabs
        tabs={tabs}
        activeId={activeTab}
        onChange={(id) => onTabChange(id as ToolsTabId)}
        ariaLabel="Operator tools"
        className="self-start"
      />

      {activeTab === "adjust" && (
        <TimeAdjustments hub={hub} snapshot={snapshot} onError={onError} />
      )}
      {activeTab === "message" && (
        <MessageInput ref={messageInputRef} hub={hub} snapshot={snapshot} onError={onError} />
      )}
      {activeTab === "schedule" && scheduleItems && (
        <ScheduleList items={scheduleItems} currentItemId={snapshot.currentItem?.id ?? null} />
      )}
    </Card>
  );
});

export default ToolsPanel;

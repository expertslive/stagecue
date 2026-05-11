import type { ReactNode } from "react";
import EventContextBar from "./EventContextBar";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <EventContextBar />
      <main className="flex-1">{children}</main>
    </div>
  );
}

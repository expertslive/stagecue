export interface TokenSpec {
  /** Internal key used by CSS variables and the API. */
  key: string;
  /** Human-friendly label for the editor. */
  label: string;
  /** Default value. */
  value: string;
  /** Section heading. */
  group: "Background" | "Text" | "Brand" | "Status" | "Message";
  /** Short description shown beneath the swatch. */
  description?: string;
}

export const tokenSpecs: TokenSpec[] = [
  { key: "bg", label: "Background", value: "#0a0a0a", group: "Background" },
  { key: "surface", label: "Card surface", value: "#161618", group: "Background" },
  { key: "text-primary", label: "Body text", value: "#e8e8e8", group: "Text" },
  { key: "text-muted", label: "Muted text", value: "#aaaaaa", group: "Text" },
  { key: "primary", label: "Countdown — above thresholds", value: "#f5f5f7", group: "Brand", description: "Color of the countdown when no threshold is active. Keep normal time calm; reserve color for state." },
  { key: "cta", label: "Action color", value: "#0a84ff", group: "Brand", description: "Used for primary buttons, links, and focus rings. Your brand accent." },
  { key: "accent", label: "Accent", value: "#8ab4f8", group: "Brand", description: "Used for pre-roll countdowns." },
  { key: "warning", label: "Warning", value: "#c9b380", group: "Status", description: "Used by the warning threshold on the countdown." },
  { key: "danger", label: "Danger", value: "#e67e22", group: "Status", description: "Used by the danger threshold on the countdown." },
  { key: "final", label: "Final", value: "#f1c40f", group: "Status", description: "Used by the final threshold on the countdown." },
  { key: "overrun", label: "Overrun", value: "#e74c3c", group: "Status", description: "Used when a session runs past its allotted time." },
  { key: "message-bg", label: "Message background", value: "#c9b380", group: "Message", description: "Background of speaker messages. Avoid alarm-red unless used for emergencies." },
  { key: "message-text", label: "Message text", value: "#0a0a0a", group: "Message" },
];

// Keep the old export shape for any code still importing it.
export const defaultTheme: Record<string, string> = Object.fromEntries(
  tokenSpecs.map((t) => [t.key, t.value]),
);

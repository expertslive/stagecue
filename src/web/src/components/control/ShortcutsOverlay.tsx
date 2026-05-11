import Sheet from "@/components/ui/Sheet";

interface Props { open: boolean; onClose: () => void }

const shortcuts: Array<[string, string]> = [
  ["Space", "Pause / Resume"],
  ["⇧ S", "Skip to next item (confirms)"],
  ["⇧ R", "Clear current session (confirms)"],
  ["M", "Focus message input"],
  ["1 – 4", "Send the corresponding preset message"],
  ["?", "Show this shortcuts list"],
  ["Esc", "Close any open dialog"],
];

export default function ShortcutsOverlay({ open, onClose }: Props) {
  return (
    <Sheet open={open} onClose={onClose} maxWidth="24rem">
      <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
      <ul className="mt-4 space-y-2 text-sm">
        {shortcuts.map(([keys, desc]) => (
          <li key={keys} className="flex items-baseline justify-between gap-4">
            <kbd className="rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 font-mono text-xs">{keys}</kbd>
            <span className="text-zinc-300">{desc}</span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

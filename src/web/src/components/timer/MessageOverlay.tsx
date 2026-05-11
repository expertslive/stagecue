import { useEffect, useState } from "react";

interface Props { message: string | null }

export default function MessageOverlay({ message }: Props) {
  // We keep the last-displayed message so the exit transition can run before the DOM is unmounted.
  const [visible, setVisible] = useState(false);
  const [displayed, setDisplayed] = useState<string | null>(null);

  useEffect(() => {
    if (message) {
      setDisplayed(message);
      // Defer to next frame so the entrance transition runs.
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      // After exit transition, clear the rendered text.
      const id = setTimeout(() => setDisplayed(null), 250);
      return () => clearTimeout(id);
    }
  }, [message]);

  if (!displayed) return null;

  return (
    <div
      role="status"
      className={`absolute left-1/2 -translate-x-1/2 px-6 py-3 rounded-md font-semibold text-2xl shadow-lg transition duration-250 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      }`}
      style={{ bottom: "18%", background: "var(--message-bg)", color: "var(--message-text)" }}
    >
      {displayed}
    </div>
  );
}

interface Props { message: string | null }

export default function MessageOverlay({ message }: Props) {
  if (!message) return null;
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 px-6 py-2 rounded-md font-semibold text-xl shadow-lg"
      style={{ bottom: "18%", background: "var(--message-bg)", color: "var(--message-text)" }}
    >
      {message}
    </div>
  );
}

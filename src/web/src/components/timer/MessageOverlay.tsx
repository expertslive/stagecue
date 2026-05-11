interface Props { message: string | null }

export default function MessageOverlay({ message }: Props) {
  if (!message) return null;

  return (
    <div
      role="status"
      className="message-enter absolute left-1/2 -translate-x-1/2 px-6 py-3 rounded-md font-semibold text-2xl shadow-lg"
      style={{ bottom: "18%", background: "var(--message-bg)", color: "var(--message-text)" }}
    >
      {message}
    </div>
  );
}

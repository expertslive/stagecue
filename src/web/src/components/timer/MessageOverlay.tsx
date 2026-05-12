interface Props { message: string | null }

export default function MessageOverlay({ message }: Props) {
  if (!message) return null;

  return (
    <div
      role="status"
      className="message-enter absolute bottom-10 left-1/2 w-[min(82vw,1120px)] -translate-x-1/2 rounded-2xl px-8 py-5 text-center text-[clamp(24px,3vw,54px)] font-semibold tracking-tight shadow-2xl"
      style={{ background: "var(--message-bg)", color: "var(--message-text)" }}
    >
      {message}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Copy, Check, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface Props {
  /** Raw 8-character access code (no dash). */
  code: string;
  /** Absolute URL the QR code resolves to (operator app's audience entrance). */
  qrUrl: string;
  /** Visual treatment. "default" is the inline format; "prominent" is for the lobby card hero. */
  size?: "default" | "prominent";
}

/**
 * Renders a formatted access code with copy-to-clipboard and a hover/focus QR popover.
 * Both lobby and room codes use this so the audience-entrance affordance feels uniform.
 */
export default function AccessCodeBadge({ code, qrUrl, size = "default" }: Props) {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!qrOpen) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setQrOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [qrOpen]);

  const formatted = formatCode(code);

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (insecure context). Fail silently — the code is still visible.
    }
  }

  const codeClass =
    size === "prominent"
      ? "font-mono text-2xl tracking-[0.15em] text-zinc-100"
      : "font-mono text-sm tracking-wider text-zinc-300";

  return (
    <div ref={wrapRef} className="relative inline-flex items-center gap-2">
      <code className={codeClass} aria-label={`Access code ${formatted}`}>{formatted}</code>
      <button
        type="button"
        onClick={copy}
        className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
        aria-label={copied ? "Copied" : "Copy access code"}
        title={copied ? "Copied" : "Copy"}
      >
        {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
      </button>
      <button
        type="button"
        onClick={() => setQrOpen((o) => !o)}
        className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
        aria-label={qrOpen ? "Hide QR code" : "Show QR code"}
        aria-expanded={qrOpen}
        title="QR code"
      >
        <QrCode className="size-4" />
      </button>

      {qrOpen && (
        <div
          role="dialog"
          aria-label="QR code"
          className="absolute left-0 top-full z-30 mt-2 rounded-xl border border-white/10 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-md"
        >
          <div className="rounded-lg bg-white p-3">
            <QRCodeSVG value={qrUrl} size={160} bgColor="#ffffff" fgColor="#0a0a0a" level="M" />
          </div>
          <p className="mt-2 max-w-[160px] text-center text-xs text-zinc-400 break-all">{qrUrl}</p>
        </div>
      )}
    </div>
  );
}

function formatCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

import { Link } from "react-router-dom";
import { ExternalLink, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import AccessCodeBadge from "./AccessCodeBadge";

interface Props {
  /** Raw 8-character lobby code (no dash). */
  code: string;
  connectedCount?: number;
  /** Triggered by the "Reset access code" item in the overflow menu. */
  onReset: () => void;
}

/**
 * Hero card for the audience lobby entrance. Treats the access code as a
 * first-class artifact: shown large, copyable, with an inline QR.
 */
export default function LobbyCard({ code, connectedCount = 0, onReset }: Props) {
  const formatted = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
  const url = `${window.location.origin}/e/${formatted}/lobby`;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <Card density="comfortable">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          {/* Inline QR — always visible at the lobby surface since it's the audience entrance. */}
          <div className="rounded-xl bg-white p-2.5 shrink-0">
            <QRCodeSVG value={url} size={88} bgColor="#ffffff" fgColor="#0a0a0a" level="M" />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-semibold text-zinc-200">Audience lobby</h2>
            </div>
            <p className="mt-0.5 max-w-md text-sm text-zinc-400">
              Point an audience phone at the QR or have them enter the code to see all rooms.
            </p>
            <div className="mt-3">
              <AccessCodeBadge code={code} qrUrl={url} size="prominent" />
            </div>
            <div className="mt-3">
              <PresencePill count={connectedCount} label={connectedCount === 1 ? "lobby display connected" : "lobby displays connected"} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:flex-col sm:items-end">
          <Link to={`/e/${formatted}/lobby`} target="_blank" rel="noopener">
            <Button leadingIcon={<ExternalLink className="size-4" />}>Open lobby</Button>
          </Link>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="rounded-md p-2 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
              aria-label="More lobby options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal className="size-4" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-30 mt-1 min-w-[220px] rounded-xl border border-white/10 bg-zinc-900/95 py-1 shadow-2xl backdrop-blur-md"
              >
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); onReset(); }}
                  className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/5"
                >
                  Reset access code…
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function PresencePill({ count, label }: { count: number; label: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
      count > 0
        ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"
        : "bg-white/5 text-zinc-500 ring-white/10"
    }`}>
      <span className={`size-1.5 rounded-full ${count > 0 ? "bg-emerald-400" : "bg-zinc-600"}`} />
      {count} {label}
    </span>
  );
}

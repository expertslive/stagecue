import { useEffect, useState } from "react";
import { rehearsalSkew } from "@/lib/rehearsal";

export default function useRehearsalClock(baseSkewMs: number) {
  const [enabled, setEnabled] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [anchorNowMs, setAnchorNowMs] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNowMs(Date.now()), 100);
    return () => clearInterval(id);
  }, [enabled]);

  const start = (nextSpeed = speed) => {
    const now = Date.now();
    setSpeed(nextSpeed);
    setAnchorNowMs(now);
    setNowMs(now);
    setEnabled(true);
  };

  const stop = () => {
    setEnabled(false);
    const now = Date.now();
    setAnchorNowMs(now);
    setNowMs(now);
  };

  return {
    enabled,
    speed,
    effectiveSkewMs: rehearsalSkew({ enabled, speed, baseSkewMs, anchorNowMs, nowMs }),
    start,
    stop,
  };
}

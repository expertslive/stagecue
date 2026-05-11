import { type ReactNode, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { auth } from "@/api/auth";
import { useAuthStore } from "@/state/authStore";
import AppShell from "@/components/shell/AppShell";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const signedIn = useAuthStore((s) => s.signedInEmail);
  const [checking, setChecking] = useState(!signedIn);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [redirectToSignIn, setRedirectToSignIn] = useState(false);

  useEffect(() => {
    if (signedIn) { setChecking(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const status = await auth.setupStatus();
        if (!status.initialized) { if (!cancelled) setNeedsSetup(true); return; }
        const probe = await fetch("/api/events", { credentials: "include" });
        if (probe.status === 401 && !cancelled) setRedirectToSignIn(true);
      } catch {
        if (!cancelled) setRedirectToSignIn(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [signedIn]);

  if (checking) return <div className="p-8">Loading…</div>;
  if (needsSetup) return <Navigate to="/setup" replace />;
  if (redirectToSignIn) return <Navigate to="/signin" replace />;
  return <AppShell>{children}</AppShell>;
}

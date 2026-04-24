import { Suspense, lazy, useEffect, useState } from "react";
import Login from "@/pages/Login";
import {
  type AuthSession,
  clearAuthSession,
  readAuthSession,
  saveAuthSession,
} from "@/lib/auth-session";
import { desktopBridgeFetch } from "@/lib/desktop-api-fetch";

const AuthenticatedApp = lazy(() => import("./AuthenticatedApp"));

const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").toString().trim();
const apiBaseUrl = rawApiBaseUrl ? rawApiBaseUrl.replace(/\/+$/, "") : null;

function resolveApiUrl(path: string) {
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}

function RouteSkeleton() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
    </div>
  );
}

function App() {
  const [session, setSession] = useState<AuthSession | null>(() =>
    readAuthSession(),
  );
  const [authChecking, setAuthChecking] = useState(() => !!readAuthSession());

  useEffect(() => {
    const current = readAuthSession();
    if (!current?.token) {
      clearAuthSession();
      setSession(null);
      setAuthChecking(false);
      return;
    }

    let cancelled = false;
    desktopBridgeFetch(resolveApiUrl("/api/auth/me"), {
      headers: { Authorization: `Bearer ${current.token}` },
    })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 401) {
          clearAuthSession();
          setSession(null);
          return;
        }
        if (!response.ok) return;
        const data = await response.json();
        const refreshed: AuthSession = {
          ...current,
          userId: data.user.id,
          name: data.user.name,
          email: data.user.email,
          expiresAt: data.expiresAt ?? current.expiresAt,
        };
        saveAuthSession(refreshed);
        setSession(refreshed);
      })
      .catch(() => {
        // API yeni baÅŸlÄ±yorsa oturumu gereksiz yere dÃ¼ÅŸÃ¼rmeyelim.
      })
      .finally(() => {
        if (!cancelled) setAuthChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAuthenticated = (nextSession: AuthSession) => {
    saveAuthSession(nextSession);
    setSession(nextSession);
  };

  const handleSessionCleared = () => {
    clearAuthSession();
    setSession(null);
  };

  if (authChecking) return <RouteSkeleton />;

  if (!session) {
    return <Login onAuthenticated={handleAuthenticated} />;
  }

  return (
    <Suspense fallback={<RouteSkeleton />}>
      <AuthenticatedApp
        session={session}
        onSessionCleared={handleSessionCleared}
      />
    </Suspense>
  );
}

export default App;

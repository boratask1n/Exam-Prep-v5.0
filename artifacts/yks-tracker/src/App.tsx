import { Suspense, lazy, type ReactNode, useEffect, useMemo, useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/layout/Sidebar";
import Login from "@/pages/Login";
import {
  type AuthSession,
  clearAuthSession,
  getAuthToken,
  readAuthSession,
  saveAuthSession,
} from "@/lib/auth-session";

const NotFound = lazy(() => import("@/pages/not-found"));
const Analysis = lazy(() => import("@/pages/Analysis"));
const AnalysisCharts = lazy(() => import("@/pages/AnalysisCharts"));
const Pool = lazy(() => import("@/pages/Pool"));
const QuestionReviewFeed = lazy(() => import("@/pages/QuestionReviewFeed"));
const Tests = lazy(() => import("@/pages/Tests"));
const TestMode = lazy(() => import("@/pages/TestMode"));
const TestResult = lazy(() => import("@/pages/TestResult"));
const Notes = lazy(() => import("@/pages/Notes"));
const NotesFeed = lazy(() => import("@/pages/NotesFeed"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      gcTime: 20 * 60 * 1000,
      retry: 1,
    },
  },
});

function RouteSkeleton() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
    </div>
  );
}

function RoutedSidebar({
  children,
  userName,
  onLogout,
  onDeleteAccount,
}: {
  children: ReactNode;
  userName?: string;
  onLogout?: () => void;
  onDeleteAccount?: () => void;
}) {
  return (
    <Sidebar userName={userName} onLogout={onLogout} onDeleteAccount={onDeleteAccount}>
      <Suspense fallback={<RouteSkeleton />}>{children}</Suspense>
    </Sidebar>
  );
}

function Router({
  userName,
  onLogout,
  onDeleteAccount,
}: {
  userName?: string;
  onLogout?: () => void;
  onDeleteAccount?: () => void;
}) {
  const wrap = (children: ReactNode) => (
    <RoutedSidebar userName={userName} onLogout={onLogout} onDeleteAccount={onDeleteAccount}>
      {children}
    </RoutedSidebar>
  );

  return (
    <Switch>
      <Route path="/" component={() => wrap(<Analysis />)} />
      <Route path="/analysis/charts" component={() => wrap(<AnalysisCharts />)} />
      <Route path="/pool" component={() => wrap(<Pool />)} />
      <Route path="/questions/review" component={() => wrap(<QuestionReviewFeed />)} />
      <Route path="/notes/feed" component={() => wrap(<NotesFeed />)} />
      <Route path="/notes" component={() => wrap(<Notes category="TYT" />)} />
      <Route path="/notes/tyt" component={() => wrap(<Notes category="TYT" />)} />
      <Route path="/notes/ayt" component={() => wrap(<Notes category="AYT" />)} />
      <Route path="/tests" component={() => wrap(<Tests />)} />
      <Route path="/tests/:id/result" component={() => wrap(<TestResult />)} />
      <Route path="/tests/:id" component={() => <Suspense fallback={<RouteSkeleton />}><TestMode /></Suspense>} />
      <Route component={() => wrap(<NotFound />)} />
    </Switch>
  );
}

function installAuthenticatedFetch() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const isApiRequest = url.startsWith("/api") || url.startsWith(`${window.location.origin}/api`);
    if (!isApiRequest) return nativeFetch(input, init);

    const baseHeaders = typeof input !== "string" && !(input instanceof URL) ? input.headers : undefined;
    const headers = new Headers(init.headers ?? baseHeaders);
    const token = getAuthToken();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return nativeFetch(input, { ...init, headers });
  };

  return () => {
    window.fetch = nativeFetch;
  };
}

function App() {
  const [session, setSession] = useState<AuthSession | null>(() => readAuthSession());
  const [authChecking, setAuthChecking] = useState(() => !!readAuthSession());
  const userName = useMemo(() => session?.name || session?.email || "Kullanıcı", [session]);

  useEffect(() => {
    setAuthTokenGetter(() => getAuthToken());
    const restoreFetch = installAuthenticatedFetch();
    return () => {
      setAuthTokenGetter(null);
      restoreFetch();
    };
  }, []);

  useEffect(() => {
    const current = readAuthSession();
    if (!current?.token) {
      clearAuthSession();
      setSession(null);
      setAuthChecking(false);
      return;
    }

    let cancelled = false;
    fetch("/api/auth/me", {
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
        // API yeni başlıyorsa oturumu gereksiz yere düşürmeyelim.
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
    queryClient.clear();
  };

  const handleLogout = () => {
    const token = session?.token;
    if (token) {
      void fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    clearAuthSession();
    setSession(null);
    queryClient.clear();
  };

  const handleDeleteAccount = async () => {
    const token = session?.token;
    if (!token) return;
    const confirmed = window.confirm(
      "Hesabını ve bu hesaba ait tüm soru, not, test ve analiz verilerini kalıcı olarak silmek istiyor musun?",
    );
    if (!confirmed) return;

    const response = await fetch("/api/auth/account", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      window.alert("Hesap silinemedi. Lütfen tekrar dene.");
      return;
    }

    clearAuthSession();
    setSession(null);
    queryClient.clear();
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {authChecking ? (
          <RouteSkeleton />
        ) : session ? (
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router userName={userName} onLogout={handleLogout} onDeleteAccount={handleDeleteAccount} />
          </WouterRouter>
        ) : (
          <Login onAuthenticated={handleAuthenticated} />
        )}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

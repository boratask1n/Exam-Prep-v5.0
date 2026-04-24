import { Suspense, lazy, type ReactNode, useEffect, useMemo } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/layout/Sidebar";
import { DesktopStatusLayer } from "@/components/desktop/DesktopStatusLayer";
import {
  type AuthSession,
  clearAuthSession,
  getAuthToken,
} from "@/lib/auth-session";
import {
  desktopBridgeFetch,
  isAllowedApiRequest,
} from "@/lib/desktop-api-fetch";

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
    <Sidebar
      userName={userName}
      onLogout={onLogout}
      onDeleteAccount={onDeleteAccount}
    >
      <Suspense fallback={<RouteSkeleton />}>{children}</Suspense>
    </Sidebar>
  );
}

function AppRouter({
  userName,
  onLogout,
  onDeleteAccount,
}: {
  userName?: string;
  onLogout?: () => void;
  onDeleteAccount?: () => void;
}) {
  const wrap = (children: ReactNode) => (
    <RoutedSidebar
      userName={userName}
      onLogout={onLogout}
      onDeleteAccount={onDeleteAccount}
    >
      {children}
    </RoutedSidebar>
  );

  return (
    <Switch>
      <Route path="/" component={() => wrap(<Analysis />)} />
      <Route path="/analysis/charts" component={() => wrap(<AnalysisCharts />)} />
      <Route path="/pool" component={() => wrap(<Pool />)} />
      <Route
        path="/questions/review"
        component={() => wrap(<QuestionReviewFeed />)}
      />
      <Route path="/notes/feed" component={() => wrap(<NotesFeed />)} />
      <Route path="/notes" component={() => wrap(<Notes category="TYT" />)} />
      <Route path="/notes/tyt" component={() => wrap(<Notes category="TYT" />)} />
      <Route path="/notes/ayt" component={() => wrap(<Notes category="AYT" />)} />
      <Route path="/tests" component={() => wrap(<Tests />)} />
      <Route path="/tests/:id/result" component={() => wrap(<TestResult />)} />
      <Route
        path="/tests/:id"
        component={() => (
          <Suspense fallback={<RouteSkeleton />}>
            <TestMode />
          </Suspense>
        )}
      />
      <Route component={() => wrap(<NotFound />)} />
    </Switch>
  );
}

let restoreAuthenticatedFetch: (() => void) | null = null;
let unauthorizedEventDispatched = false;
const unauthorizedEventName = "exam-prep:unauthorized";

function ensureAuthenticatedFetch() {
  setBaseUrl(apiBaseUrl);
  setAuthTokenGetter(() => getAuthToken());

  if (restoreAuthenticatedFetch) return;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (!isAllowedApiRequest(url)) return nativeFetch(input, init);

    const baseHeaders =
      typeof input !== "string" && !(input instanceof URL)
        ? input.headers
        : undefined;
    const headers = new Headers(init.headers ?? baseHeaders);
    const token = getAuthToken();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    const response = await desktopBridgeFetch(
      input,
      { ...init, headers },
      nativeFetch,
    );

    if (
      response.status === 401 &&
      !unauthorizedEventDispatched &&
      !url.includes("/api/auth/login")
    ) {
      unauthorizedEventDispatched = true;
      window.dispatchEvent(new Event(unauthorizedEventName));
      window.setTimeout(() => {
        unauthorizedEventDispatched = false;
      }, 0);
    }

    return response;
  };

  restoreAuthenticatedFetch = () => {
    window.fetch = nativeFetch;
    restoreAuthenticatedFetch = null;
  };
}

function restoreAuthenticatedApi() {
  setBaseUrl(null);
  setAuthTokenGetter(null);
  restoreAuthenticatedFetch?.();
}

type AuthenticatedAppProps = {
  session: AuthSession;
  onSessionCleared: () => void;
};

export default function AuthenticatedApp({
  session,
  onSessionCleared,
}: AuthenticatedAppProps) {
  ensureAuthenticatedFetch();

  const userName = useMemo(
    () => session.name || session.email || "KullanÄ±cÄ±",
    [session.email, session.name],
  );

  useEffect(() => {
    const handleUnauthorized = () => {
      clearAuthSession();
      queryClient.clear();
      onSessionCleared();
    };

    window.addEventListener(unauthorizedEventName, handleUnauthorized);
    return () => {
      window.removeEventListener(unauthorizedEventName, handleUnauthorized);
      restoreAuthenticatedApi();
    };
  }, [onSessionCleared]);

  const handleLogout = () => {
    const token = session.token;
    if (token) {
      void fetch(resolveApiUrl("/api/auth/logout"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    clearAuthSession();
    queryClient.clear();
    onSessionCleared();
  };

  const handleDeleteAccount = async () => {
    const token = session.token;
    if (!token) return;
    const confirmed = window.confirm(
      "HesabÄ±nÄ± ve bu hesaba ait tÃ¼m soru, not, test ve analiz verilerini kalÄ±cÄ± olarak silmek istiyor musun?",
    );
    if (!confirmed) return;

    const response = await fetch(resolveApiUrl("/api/auth/account"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      window.alert("Hesap silinemedi. LÃ¼tfen tekrar dene.");
      return;
    }

    clearAuthSession();
    queryClient.clear();
    onSessionCleared();
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRouter
            userName={userName}
            onLogout={handleLogout}
            onDeleteAccount={handleDeleteAccount}
          />
        </WouterRouter>
        <DesktopStatusLayer />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

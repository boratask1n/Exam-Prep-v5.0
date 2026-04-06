import { Suspense, lazy, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/layout/Sidebar";

const NotFound = lazy(() => import("@/pages/not-found"));
const Analysis = lazy(() => import("@/pages/Analysis"));
const AnalysisCharts = lazy(() => import("@/pages/AnalysisCharts"));
const Pool = lazy(() => import("@/pages/Pool"));
const Tests = lazy(() => import("@/pages/Tests"));
const TestMode = lazy(() => import("@/pages/TestMode"));
const TestResult = lazy(() => import("@/pages/TestResult"));
const Notes = lazy(() => import("@/pages/Notes"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
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

function RoutedSidebar({ children }: { children: ReactNode }) {
  return (
    <Sidebar>
      <Suspense fallback={<RouteSkeleton />}>{children}</Suspense>
    </Sidebar>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <RoutedSidebar><Analysis /></RoutedSidebar>} />
      <Route path="/analysis/charts" component={() => <RoutedSidebar><AnalysisCharts /></RoutedSidebar>} />
      <Route path="/pool" component={() => <RoutedSidebar><Pool /></RoutedSidebar>} />
      <Route path="/notes" component={() => <RoutedSidebar><Notes category="TYT" /></RoutedSidebar>} />
      <Route path="/notes/tyt" component={() => <RoutedSidebar><Notes category="TYT" /></RoutedSidebar>} />
      <Route path="/notes/ayt" component={() => <RoutedSidebar><Notes category="AYT" /></RoutedSidebar>} />
      <Route path="/tests" component={() => <RoutedSidebar><Tests /></RoutedSidebar>} />
      <Route path="/tests/:id/result" component={() => <RoutedSidebar><TestResult /></RoutedSidebar>} />
      <Route path="/tests/:id" component={() => <Suspense fallback={<RouteSkeleton />}><TestMode /></Suspense>} />
      <Route component={() => <RoutedSidebar><NotFound /></RoutedSidebar>} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

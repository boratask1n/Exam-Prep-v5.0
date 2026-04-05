import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { Sidebar } from "@/components/layout/Sidebar";
import Analysis from "@/pages/Analysis";
import AnalysisCharts from "@/pages/AnalysisCharts";
import Pool from "@/pages/Pool";
import Tests from "@/pages/Tests";
import TestMode from "@/pages/TestMode";
import TestResult from "@/pages/TestResult";
import Notes from "@/pages/Notes";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <Sidebar><Analysis /></Sidebar>} />
      <Route path="/analysis/charts" component={() => <Sidebar><AnalysisCharts /></Sidebar>} />
      <Route path="/pool" component={() => <Sidebar><Pool /></Sidebar>} />
      <Route path="/notes" component={() => <Sidebar><Notes category="TYT" /></Sidebar>} />
      <Route path="/notes/tyt" component={() => <Sidebar><Notes category="TYT" /></Sidebar>} />
      <Route path="/notes/ayt" component={() => <Sidebar><Notes category="AYT" /></Sidebar>} />
      <Route path="/tests" component={() => <Sidebar><Tests /></Sidebar>} />
      <Route path="/tests/:id/result" component={() => <Sidebar><TestResult /></Sidebar>} />
      <Route path="/tests/:id" component={TestMode} />
      <Route component={() => <Sidebar><NotFound /></Sidebar>} />
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

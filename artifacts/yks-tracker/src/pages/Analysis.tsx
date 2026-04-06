import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  BarChart3,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MinusCircle,
  Repeat2,
  Target,
  Trash2,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type OverviewResponse = {
  dateRange: { startDate: string; endDate: string };
  summary: {
    totalQuestions: number;
    correctCount: number;
    wrongCount: number;
    skippedCount: number;
    successRate: number;
  };
  subjectStats: Array<{
    lesson: string;
    totalQuestions: number;
    correctCount: number;
    wrongCount: number;
    skippedCount: number;
    successRate: number;
    net: number;
  }>;
  weakTopics: Array<{
    lesson: string;
    topic: string;
    totalQuestions: number;
    answeredCount: number;
    correctCount: number;
    wrongCount: number;
    skippedCount: number;
    wrongRatio: number;
  }>;
  repeatReminders: Array<{
    lesson: string;
    topic: string;
    totalQuestions: number;
    answeredCount: number;
    correctCount: number;
    wrongCount: number;
    skippedCount: number;
    wrongRatio: number;
    repeatPriority: "high" | "medium" | "low";
    trigger?: "aggregate" | "single_test_spike";
  }>;
  recentResults: Array<{
    testSessionId: number;
    isTestDeleted?: boolean;
    testName: string;
    totalQuestions: number;
    correctCount: number;
    wrongCount: number;
    skippedCount: number;
    elapsedSeconds: number;
    completedAt: string;
  }>;
};

type AiInsightsResponse = {
  generatedBy: "ai" | "rule_based";
  summary: string;
  priorityTopics: Array<{
    lesson: string;
    topic: string;
    reason: string;
    action: string;
  }>;
  weeklyPlan: string[];
  examRiskNotes: string[];
  aiWeakTopicHints: Array<{
    lesson: string;
    topic: string;
    why: string;
    suggestion: string;
  }>;
  aiRepeatHints: Array<{
    lesson: string;
    topic: string;
    cadence: string;
    suggestion: string;
  }>;
  aiSuggestedTest: {
    name: string;
    reason: string;
    count: number;
    filters: {
      lessons: string[];
      topics: string[];
      status: "Cozulmedi";
    };
    distribution: Record<string, number>;
  } | null;
};

type AiStatusResponse = {
  provider: "gemini" | "rule_based";
  model: string;
  geminiConfigured?: boolean;
};

type AiInsightsCache = {
  insights: AiInsightsResponse;
  requestedAt: string;
};

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDuration(totalSeconds: number) {
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

const defaultEnd = new Date();
const defaultStart = new Date(defaultEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
const AI_INSIGHTS_CACHE_KEY = "analysis_ai_insights_cache_v3";

export default function Analysis() {
  const [dateMode, setDateMode] = useState<"range" | "all">("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [startDate, setStartDate] = useState(toDateInputValue(defaultStart));
  const [endDate, setEndDate] = useState(toDateInputValue(defaultEnd));
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);

  const [aiInsights, setAiInsights] = useState<AiInsightsResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCreatingTest, setAiCreatingTest] = useState(false);
  const [creatingDiagnosticTest, setCreatingDiagnosticTest] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatusResponse | null>(null);
  const [aiRequestedAt, setAiRequestedAt] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(AI_INSIGHTS_CACHE_KEY);
      if (!raw) return;
      const cached = JSON.parse(raw) as AiInsightsCache;
      if (!cached?.insights || !cached?.requestedAt) return;
      setAiInsights(cached.insights);
      setAiRequestedAt(cached.requestedAt);
    } catch {
      // ignore malformed cache
    }
  }, []);

  const effectiveStartDate = dateMode === "all" ? "2000-01-01" : startDate;
  const effectiveEndDate = dateMode === "all" ? toDateInputValue(new Date()) : endDate;
  const analyticsQuery = `startDate=${encodeURIComponent(effectiveStartDate)}&endDate=${encodeURIComponent(effectiveEndDate)}`;

  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [overviewResult, statusResult] = await Promise.allSettled([
          fetch(
            `/api/analytics/overview?${analyticsQuery}`,
            { signal: controller.signal },
          ),
          fetch(`/api/analytics/ai-status`, { signal: controller.signal }),
        ]);

        if (overviewResult.status === "fulfilled" && overviewResult.value.ok) {
          setData((await overviewResult.value.json()) as OverviewResponse);
        } else {
          throw new Error("Overview fetch failed");
        }

        if (statusResult.status === "fulfilled" && statusResult.value.ok) {
          setAiStatus((await statusResult.value.json()) as AiStatusResponse);
        } else {
          setAiStatus(null);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error(err);
          setError("Analiz verileri alınamadı.");
        }
      } finally {
        setLoading(false);
      }
    };

    void run();
    return () => controller.abort();
  }, [analyticsQuery, refreshKey]);

  const requestAiInsights = async () => {
    setAiLoading(true);
    try {
      const response = await fetch("/api/analytics/ai-insights");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const aiBody = (await response.json()) as AiInsightsResponse;
      const requestedAt = new Date().toISOString();

      setAiInsights(aiBody);
      setAiRequestedAt(requestedAt);

      const cachePayload: AiInsightsCache = {
        insights: aiBody,
        requestedAt,
      };
      window.localStorage.setItem(AI_INSIGHTS_CACHE_KEY, JSON.stringify(cachePayload));
      setError(null);
      setInfoNotice(null);
    } catch (err) {
      console.error(err);
      setError("Yapay zeka analizi alınamadı.");
    } finally {
      setAiLoading(false);
    }
  };

  const createTestFromAiSuggestion = async () => {
    if (!aiInsights?.aiSuggestedTest) return;
    setAiCreatingTest(true);
    try {
      const createTest = async (payload: unknown) => {
        const response = await fetch("/api/tests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { code?: string; error?: string };
          return {
            ok: false as const,
            status: response.status,
            code: body.code ?? "",
            error: body.error ?? "",
          };
        }
        return (await response.json()) as { id: number; questionCount: number; name: string };
      };

      const payload = {
        name: aiInsights.aiSuggestedTest.name,
        count: aiInsights.aiSuggestedTest.count,
        timeLimitSeconds: null,
        filters: aiInsights.aiSuggestedTest.filters,
        distribution: aiInsights.aiSuggestedTest.distribution,
      };
      const firstAttempt = await createTest(payload);
      let created: { id: number; questionCount: number; name: string } | null =
        "ok" in firstAttempt ? null : firstAttempt;

      // İlk deneme filtre/distribution nedeniyle az veya 0 soru döndürürse otomatik esnet.
      if (!created || created.questionCount < 5) {
        const relaxedPayload = {
          name: `${aiInsights.aiSuggestedTest.name} (Esnek)`,
          count: aiInsights.aiSuggestedTest.count,
          timeLimitSeconds: null,
          filters: {
            lessons: aiInsights.aiSuggestedTest.filters.lessons,
            status: "Cozulmedi" as const,
          },
        };
        const secondAttempt = await createTest(relaxedPayload);
        created = "ok" in secondAttempt ? null : secondAttempt;
      }

      if (!created || created.questionCount < 1) {
        throw new Error("AI suggested test created with zero questions");
      }

      setError(null);
      setInfoNotice(`AI test önerisi oluşturuldu (${created.questionCount} soru). Test merkezinden çözebilirsin.`);
    } catch (err) {
      console.error(err);
      setError("AI öneri testi oluşturulamadı.");
      setInfoNotice(null);
    } finally {
      setAiCreatingTest(false);
    }
  };

  const createDiagnosticTest = async () => {
    setCreatingDiagnosticTest(true);
    try {
      const payload = {
        name: "AI Kazanım Tarama Testi",
        count: 20,
        timeLimitSeconds: 40 * 60,
      };
      const response = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const created = (await response.json()) as { questionCount: number };
      if ((created.questionCount ?? 0) === 0) {
        setError("Tarama testi oluşturulamadı. Soru havuzunda yeterli soru yok.");
        setInfoNotice(null);
        return;
      }

      setError(null);
      setInfoNotice(
        `AI kazanım tarama testi oluşturuldu (${created.questionCount} soru). Test merkezinden çözüp ilk AI değerlendirmeyi alabilirsin.`,
      );
    } catch (err) {
      console.error(err);
      setError("Tarama testi oluşturulamadı.");
      setInfoNotice(null);
    } finally {
      setCreatingDiagnosticTest(false);
    }
  };

  const deleteAnalyticsOnly = async (testSessionId: number) => {
    const confirmed = window.confirm("Bu testin analiz kaydı tamamen silinecek. İşlem geri alınamaz. Devam edilsin mi?");
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/tests/${testSessionId}/analytics`, { method: "DELETE" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      console.error(err);
      setError("Analiz kaydı silinemedi.");
    }
  };

  const summary = data?.summary ?? {
    totalQuestions: 0,
    correctCount: 0,
    wrongCount: 0,
    skippedCount: 0,
    successRate: 0,
  };

  const ringCircumference = 2 * Math.PI * 52;
  const successDash = ringCircumference * (1 - summary.successRate);
  const isAiInsightsActive = aiInsights?.generatedBy === "ai";
  const isGeminiMode = aiStatus?.provider === "gemini";
  const hideSystemSuggestions = isGeminiMode && !!aiInsights;
  const weakTopicKeySet = new Set((data?.weakTopics ?? []).map((w) => `${w.lesson}__${w.topic}`));
  const differentiatedRepeatReminders = (data?.repeatReminders ?? []).filter(
    (item) => !weakTopicKeySet.has(`${item.lesson}__${item.topic}`),
  );
  const runtimeProviderLabel = aiStatus?.provider === "gemini" ? "Gemini hazır" : "Fallback aktif";
  const runtimeProviderTone =
    aiStatus?.provider === "gemini" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300";
  const lastAnalysisSourceLabel =
    aiInsights?.generatedBy === "ai" ? "Son analiz: AI" : aiInsights?.generatedBy === "rule_based" ? "Son analiz: Kural tabanlı" : null;
  const aiRequestedAtLabel = aiRequestedAt ? new Date(aiRequestedAt).toLocaleString("tr-TR") : null;
  const showDiagnosticPrompt =
    aiInsights?.generatedBy === "rule_based" &&
    aiInsights.summary.toLocaleLowerCase("tr-TR").includes("henüz sistem genelinde çözülen soru verisi yok");

  const summaryCards = useMemo(
    () => [
      {
        title: "Toplam Soru",
        value: summary.totalQuestions,
        icon: Target,
        tone: "bg-primary/15 text-primary",
        note: dateMode === "all" ? "Tüm zamanlar" : `${startDate} - ${endDate}`,
      },
      {
        title: "Doğru",
        value: summary.correctCount,
        icon: CheckCircle2,
        tone: "bg-emerald-500/15 text-emerald-400",
        note: `%${summary.totalQuestions > 0 ? ((summary.correctCount / summary.totalQuestions) * 100).toFixed(1) : "0.0"}`,
      },
      {
        title: "Yanlış",
        value: summary.wrongCount,
        icon: XCircle,
        tone: "bg-rose-500/15 text-rose-400",
        note: `%${summary.totalQuestions > 0 ? ((summary.wrongCount / summary.totalQuestions) * 100).toFixed(1) : "0.0"}`,
      },
      {
        title: "Boş",
        value: summary.skippedCount,
        icon: MinusCircle,
        tone: "bg-amber-500/15 text-amber-300",
        note: `%${summary.totalQuestions > 0 ? ((summary.skippedCount / summary.totalQuestions) * 100).toFixed(1) : "0.0"}`,
      },
    ],
    [summary, startDate, endDate, dateMode],
  );

  return (
    <div className="relative min-h-full w-full overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-24 -top-20 h-72 w-72 rounded-full bg-primary/16 blur-3xl" />
        <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-accent/25 blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="glass-panel rounded-[1.6rem] border-border/60 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Analiz Paneli</h1>
              <p className="mt-1 text-sm text-muted-foreground">Test ve soru performansını tek ekranda gör.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAdvancedFilters((prev) => !prev)}
                className="inline-flex items-center rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-sm text-foreground hover:bg-foreground/[0.04]"
              >
                Gelişmiş filtre
              </button>
              <Link href="/analysis/charts" className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-sm text-foreground hover:bg-foreground/[0.04]">
                <BarChart3 className="h-4 w-4 text-primary" />
                Grafikler
              </Link>
            </div>
          </div>
          {showAdvancedFilters ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/50 pt-4">
              <select
                value={dateMode}
                onChange={(e) => setDateMode(e.target.value as "range" | "all")}
                className="rounded-xl border border-border/60 bg-card/70 px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/60"
              >
                <option value="all">Tüm Zamanlar</option>
                <option value="range">Tarih Aralığı</option>
              </select>
              <input
                type="date"
                value={startDate}
                disabled={dateMode === "all"}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-xl border border-border/60 bg-card/70 px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/60 disabled:opacity-60"
              />
              <span className="text-xs text-muted-foreground">-</span>
              <input
                type="date"
                value={endDate}
                disabled={dateMode === "all"}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-xl border border-border/60 bg-card/70 px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/60 disabled:opacity-60"
              />
            </div>
          ) : null}
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {summaryCards.map((item) => (
            <article key={item.title} className="glass-panel rounded-[1.35rem] border-border/55 p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", item.tone)}>
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{item.title}</span>
              </div>
              <p className="text-2xl font-bold text-foreground sm:text-3xl">{item.value.toLocaleString("tr-TR")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-3 lg:gap-6">
          <article className="glass-panel rounded-[1.5rem] border-border/55 p-5 sm:p-6 lg:col-span-2">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Ders Bazlı Performans</h2>
              <span className="text-xs text-muted-foreground">{data?.subjectStats.length ?? 0} ders</span>
            </div>
            <div className="space-y-4">
              {(data?.subjectStats.length ?? 0) === 0 && (
                <p className="rounded-xl border border-border/50 bg-card/50 p-3 text-xs text-muted-foreground">
                  Ders bazlı performansın burada görünecek. Bu alanın dolması için soru havuzundan bir test çözüp sonucu analize eklemen yeterli.
                </p>
              )}
              {(data?.subjectStats ?? []).map((s) => {
                const correctPct = s.totalQuestions > 0 ? (s.correctCount / s.totalQuestions) * 100 : 0;
                const wrongPct = s.totalQuestions > 0 ? (s.wrongCount / s.totalQuestions) * 100 : 0;
                return (
                  <div key={s.lesson} className="flex items-center gap-3">
                    <div className="w-24 shrink-0 text-sm text-foreground/90">{s.lesson}</div>
                    <div className="flex h-7 flex-1 overflow-hidden rounded-full bg-muted/30">
                      <div className="h-full bg-emerald-500/80" style={{ width: `${correctPct}%` }} />
                      <div className="h-full bg-rose-500/75" style={{ width: `${wrongPct}%` }} />
                    </div>
                    <div className="w-14 text-right text-sm font-semibold text-foreground">{s.net.toFixed(1)}</div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="glass-panel flex flex-col rounded-[1.5rem] border-border/55 p-5 sm:p-6">
            <h2 className="mb-5 text-lg font-semibold text-foreground">Genel Başarı</h2>
            <div className="relative mx-auto mb-4 h-44 w-44">
              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--muted) / 0.4)" strokeWidth="10" />
                <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--primary))" strokeWidth="10" strokeLinecap="round" strokeDasharray={ringCircumference} strokeDashoffset={successDash} className="transition-all duration-700" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-foreground">%{(summary.successRate * 100).toFixed(1)}</span>
                <span className="text-xs text-muted-foreground">Net başarı</span>
              </div>
            </div>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2 lg:gap-6">
          <article className="glass-panel rounded-[1.5rem] border-border/55 p-5 sm:p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground"><AlertTriangle className="h-5 w-5 text-amber-400" />Zayıf Konular</h2>
            <div className="space-y-3">
              {(!hideSystemSuggestions ? (data?.weakTopics ?? []).length : 0) === 0 &&
                (aiInsights?.aiWeakTopicHints?.length ?? 0) === 0 && (
                  <p className="rounded-xl border border-border/50 bg-card/50 p-3 text-xs text-muted-foreground">
                    Zayıf konu sinyalleri burada listelenecek. Yeterli veri oluştuğunda sık hata yaptığın veya yeniden dikkat gerektiren konular otomatik olarak görünecek.
                  </p>
                )}
              {(!hideSystemSuggestions ? (data?.weakTopics ?? []).slice(0, 8) : []).map((topic) => {
                const pct = Math.round(topic.wrongRatio * 100);
                return (
                  <div key={`${topic.lesson}-${topic.topic}`} className="rounded-xl border border-border/40 bg-card/45 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{topic.topic}</p>
                        <p className="text-xs text-muted-foreground">{topic.lesson}</p>
                      </div>
                      <span className="text-xs font-medium text-rose-300">%{pct} hata</span>
                    </div>
                  </div>
                );
              })}
              {(aiInsights?.aiWeakTopicHints ?? []).map((topic) => (
                <div key={`ai-weak-${topic.lesson}-${topic.topic}`} className="rounded-xl border border-primary/40 bg-primary/10 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{topic.topic}</p>
                      <p className="text-xs text-muted-foreground">{topic.lesson}</p>
                    </div>
                    <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">AI önerisi</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{topic.why}</p>
                  <p className="mt-1 text-[11px] text-primary/90">{topic.suggestion}</p>
                </div>
              ))}
              {hideSystemSuggestions && (aiInsights?.aiWeakTopicHints?.length ?? 0) === 0 && (
                <p className="rounded-xl border border-border/50 bg-card/50 p-3 text-xs text-muted-foreground">
                  Bu tarih aralığı için AI ek zayıf konu önerisi üretmedi.
                </p>
              )}
            </div>
          </article>

          <article className="glass-panel rounded-[1.5rem] border-border/55 p-5 sm:p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground"><Repeat2 className="h-5 w-5 text-primary" />Tekrar Uyarıları</h2>
            <div className="space-y-3">
              {(!hideSystemSuggestions ? differentiatedRepeatReminders : []).map((item) => (
                <div key={`${item.lesson}-${item.topic}`} className="rounded-xl border border-border/40 bg-card/45 p-3">
                  <p className="text-sm font-semibold text-foreground">{item.topic}</p>
                  <p className="text-xs text-muted-foreground">{item.lesson} · %{Math.round(item.wrongRatio * 100)} hata</p>
                </div>
              ))}
              {!hideSystemSuggestions && differentiatedRepeatReminders.length === 0 && (
                <p className="rounded-xl border border-border/50 bg-card/50 p-3 text-xs text-muted-foreground">
                  Tekrar listesi, zayıf konularla çakışmayan önceliklere göre boş kaldı. Bu durumda üstteki zayıf konulara odaklanman yeterli.
                </p>
              )}
              {(aiInsights?.aiRepeatHints ?? []).map((item) => (
                <div key={`ai-repeat-${item.lesson}-${item.topic}`} className="rounded-xl border border-primary/40 bg-primary/10 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{item.topic}</p>
                    <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">AI önerisi</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.lesson} · {item.cadence}</p>
                  <p className="mt-1 text-[11px] text-primary/90">{item.suggestion}</p>
                </div>
              ))}
              {hideSystemSuggestions && (aiInsights?.aiRepeatHints?.length ?? 0) === 0 && (
                <p className="rounded-xl border border-border/50 bg-card/50 p-3 text-xs text-muted-foreground">
                  Bu tarih aralığı için AI ek tekrar önerisi üretmedi.
                </p>
              )}
            </div>
          </article>
        </section>

        <section className="glass-panel rounded-[1.5rem] border-border/55 p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Brain className="h-5 w-5 text-primary" />
              Yapay Zeka Destekli Çalışma Önerisi
            </h2>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button
                type="button"
                onClick={() => void requestAiInsights()}
                disabled={aiLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-1.5 text-xs text-foreground hover:bg-foreground/[0.04] disabled:opacity-60"
              >
                {aiLoading ? "Analiz hazırlanıyor..." : "Yapay zeka analizi üret"}
              </button>
              <span className={cn("rounded-full px-2 py-1 text-[11px] font-medium", runtimeProviderTone)}>
                {runtimeProviderLabel}
              </span>
            </div>
          </div>

          <p className="mb-3 text-xs text-muted-foreground">
            Not: Gemini analizi sadece butona bastığında çağrılır. AI yorumu menüde seçtiğin tarih aralığından bağımsız olarak tüm geçmişi değerlendirir ve son sonuç sayfa yenilemede korunur.
          </p>
          {showDiagnosticPrompt && (
            <div className="mb-3 rounded-xl border border-primary/40 bg-primary/10 p-3">
              <p className="text-xs text-foreground/90">
                Henüz analiz verisi yok. İlk değerlendirme için soru havuzundan bir AI kazanım tarama testi oluşturup test merkezinde çözebilirsin.
              </p>
              <button
                type="button"
                onClick={() => void createDiagnosticTest()}
                disabled={creatingDiagnosticTest}
                className="mt-2 inline-flex items-center gap-2 rounded-xl border border-primary/50 bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 disabled:opacity-60"
              >
                {creatingDiagnosticTest ? "Tarama testi oluşturuluyor..." : "Veri oluştur: AI tarama testi oluştur"}
              </button>
            </div>
          )}
          {lastAnalysisSourceLabel && (
            <p className="mb-2 text-xs text-muted-foreground">{lastAnalysisSourceLabel}</p>
          )}
          {aiRequestedAtLabel && (
            <p className="mb-3 text-xs text-muted-foreground">
              Son AI analizi: Tüm zamanlar ({aiRequestedAtLabel})
            </p>
          )}

          {aiLoading && <p className="text-sm text-muted-foreground">Yorum hazırlanıyor...</p>}

          {!aiLoading && !aiInsights && (
            <p className="rounded-xl border border-border/50 bg-card/50 p-4 text-sm text-muted-foreground">
              Yapay zeka analizi görmek için "Yapay zeka analizi üret" butonuna bas. Bu bölüm tarih filtresinden bağımsız olarak tüm çalışma geçmişini değerlendirir.
            </p>
          )}

          {!aiLoading && aiInsights && (
            <div className="grid gap-4 lg:grid-cols-3">
              <article className="rounded-xl border border-border/40 bg-card/45 p-4 lg:col-span-3">
                <p className="text-sm text-foreground/90">{aiInsights.summary}</p>
              </article>
              <article className="rounded-xl border border-border/40 bg-card/45 p-4">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Öncelikli Konular</h3>
                <div className="space-y-2">
                  {aiInsights.priorityTopics.length === 0 && <p className="text-xs text-muted-foreground">Kritik konu görünmüyor.</p>}
                  {aiInsights.priorityTopics.map((item) => (
                    <div key={`${item.lesson}-${item.topic}`} className="rounded-lg border border-border/40 p-2">
                      <p className="text-xs font-semibold text-foreground">{item.lesson} - {item.topic}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{item.reason}</p>
                      <p className="mt-1 text-[11px] text-primary/90">{item.action}</p>
                    </div>
                  ))}
                </div>
              </article>
              <article className="rounded-xl border border-border/40 bg-card/45 p-4">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Haftalık Plan</h3>
                {aiInsights.weeklyPlan.map((item, idx) => (
                  <p key={idx} className="text-xs text-foreground/90">{idx + 1}. {item}</p>
                ))}
              </article>
              <article className="rounded-xl border border-border/40 bg-card/45 p-4">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Risk Notları</h3>
                {aiInsights.examRiskNotes.map((item, idx) => (
                  <p key={idx} className="text-xs text-foreground/90">{idx + 1}. {item}</p>
                ))}
              </article>
              {aiInsights.aiSuggestedTest && (
                <article className="rounded-xl border border-primary/40 bg-primary/10 p-4 lg:col-span-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{aiInsights.aiSuggestedTest.name}</h3>
                    <span className="rounded-full bg-primary/20 px-2 py-1 text-[11px] font-medium text-primary">AI test önerisi</span>
                  </div>
                  <p className="text-xs text-foreground/90">{aiInsights.aiSuggestedTest.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Dersler: {aiInsights.aiSuggestedTest.filters.lessons.join(", ")} · Hedef soru: {aiInsights.aiSuggestedTest.count}
                  </p>
                  <button
                    type="button"
                    onClick={() => void createTestFromAiSuggestion()}
                    disabled={aiCreatingTest}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl border border-primary/50 bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 disabled:opacity-60"
                  >
                    {aiCreatingTest ? "Oluşturuluyor..." : "Bu AI testini oluştur"}
                  </button>
                </article>
              )}
            </div>
          )}
        </section>

        <section className="glass-panel rounded-[1.5rem] border-border/55 p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Son Çözülen Testler</h2>
            <Link href="/tests" className="text-xs font-medium text-primary hover:text-primary/80">Tümünü Gör</Link>
          </div>
          {(data?.recentResults ?? []).length === 0 ? (
            <p className="rounded-xl border border-border/50 bg-card/50 p-4 text-sm text-muted-foreground">Seçilen tarih aralığında sonuç bulunmuyor.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    <th className="pb-3 pr-3">Test</th>
                    <th className="pb-3 pr-3 text-center">Doğru</th>
                    <th className="pb-3 pr-3 text-center">Yanlış</th>
                    <th className="pb-3 pr-3 text-center">Net</th>
                    <th className="pb-3 pr-3 text-center">Süre</th>
                    <th className="pb-3 text-right">Tarih</th>
                    <th className="pb-3 pl-3 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recentResults ?? []).map((row) => {
                    const net = row.correctCount - row.wrongCount / 4;
                    return (
                      <tr key={row.testSessionId} className="border-b border-border/30 hover:bg-foreground/[0.02]">
                        <td className="py-3 pr-3">
                          <Link href={`/tests/${row.testSessionId}/result`} className="group inline-flex items-center gap-1 font-medium text-foreground/90">
                            <span className="line-clamp-1">{row.testName}</span>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition group-hover:text-primary" />
                          </Link>
                        </td>
                        <td className="py-3 pr-3 text-center text-emerald-400">{row.correctCount}</td>
                        <td className="py-3 pr-3 text-center text-rose-400">{row.wrongCount}</td>
                        <td className="py-3 pr-3 text-center text-foreground">{net.toFixed(1)}</td>
                        <td className="py-3 pr-3 text-center text-muted-foreground">{formatDuration(row.elapsedSeconds)}</td>
                        <td className="py-3 text-right text-muted-foreground">{new Date(row.completedAt).toLocaleDateString("tr-TR")}</td>
                        <td className="py-3 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => void deleteAnalyticsOnly(row.testSessionId)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Bu testin analiz kaydını tamamen sil"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Tam sil
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-3 pb-4">
          <Link href="/pool" className="glass-panel rounded-xl border-border/60 px-4 py-2 text-sm text-foreground hover:bg-foreground/[0.04]">Soru Havuzuna Git</Link>
          <Link href="/tests" className="glass-panel rounded-xl border-border/60 px-4 py-2 text-sm text-foreground hover:bg-foreground/[0.04]">Test Merkezine Git</Link>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            Tekrar uyarısı: 4+ çözümde %50+ hata veya tek testte aynı konudan 3+ yanlış.
          </span>
        </div>
      </div>

      {loading && (
        <div className="fixed bottom-5 right-5 glass-panel flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5 animate-pulse" />
          Veriler güncelleniyor
        </div>
      )}
      {infoNotice && (
        <div className="fixed bottom-5 left-5 glass-panel rounded-xl border border-primary/40 bg-primary/12 px-3 py-2 text-xs text-primary">
          {infoNotice}
        </div>
      )}
      {error && <div className="fixed bottom-5 left-5 glass-panel rounded-xl px-3 py-2 text-xs text-destructive">{error}</div>}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { BarChart3, CheckCircle2, ChevronLeft, Filter, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type OverviewResponse = {
  subjectStats: Array<{
    lesson: string;
    totalQuestions: number;
    correctCount: number;
    wrongCount: number;
    skippedCount: number;
    successRate: number;
    net: number;
  }>;
  topicStats: Array<{
    lesson: string;
    topic: string;
    totalQuestions: number;
    answeredCount: number;
    correctCount: number;
    wrongCount: number;
    skippedCount: number;
    wrongRatio: number;
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
  }>;
};

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const defaultEnd = new Date();
const defaultStart = new Date(defaultEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

export default function AnalysisCharts() {
  const [startDate, setStartDate] = useState(toDateInputValue(defaultStart));
  const [endDate, setEndDate] = useState(toDateInputValue(defaultEnd));
  const [selectedLessons, setSelectedLessons] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/analytics/overview?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setData((await response.json()) as OverviewResponse);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Failed to fetch chart analytics", err);
        }
      } finally {
        setLoading(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [startDate, endDate]);

  const lessonOptions = useMemo(() => {
    return [...(data?.subjectStats ?? [])]
      .sort((a, b) => b.totalQuestions - a.totalQuestions)
      .map((item) => item.lesson);
  }, [data?.subjectStats]);

  const topicOptions = useMemo(() => {
    if (selectedLessons.length === 0) return [];
    return (data?.topicStats ?? [])
      .filter((item) => selectedLessons.includes(item.lesson))
      .map((item) => item.topic);
  }, [data?.topicStats, selectedLessons]);

  const lessonCompare = useMemo(() => {
    if (selectedLessons.length === 0) return [];
    return (data?.subjectStats ?? []).filter((item) => selectedLessons.includes(item.lesson));
  }, [data?.subjectStats, selectedLessons]);

  const topicCompare = useMemo(() => {
    if (selectedLessons.length === 0) return [];
    const pool = (data?.topicStats ?? []).filter((item) => selectedLessons.includes(item.lesson));
    if (selectedTopics.length === 0) {
      return [...pool].sort((a, b) => b.wrongRatio - a.wrongRatio).slice(0, 10);
    }
    return pool.filter((item) => selectedTopics.includes(item.topic));
  }, [data?.topicStats, selectedLessons, selectedTopics]);

  const lessonDistribution = useMemo(() => {
    return lessonCompare.map((item) => {
      const total = Math.max(1, item.totalQuestions);
      return {
        ...item,
        correctPct: (item.correctCount / total) * 100,
        wrongPct: (item.wrongCount / total) * 100,
        skippedPct: (item.skippedCount / total) * 100,
      };
    });
  }, [lessonCompare]);

  const selectedLessonSummary = useMemo(() => {
    return lessonCompare.reduce(
      (acc, item) => {
        acc.totalQuestions += item.totalQuestions;
        acc.correctCount += item.correctCount;
        acc.wrongCount += item.wrongCount;
        acc.skippedCount += item.skippedCount;
        acc.net += item.net;
        return acc;
      },
      { totalQuestions: 0, correctCount: 0, wrongCount: 0, skippedCount: 0, net: 0 },
    );
  }, [lessonCompare]);

  const selectedLessonSuccessAverage = useMemo(() => {
    if (lessonCompare.length === 0) return 0;
    return lessonCompare.reduce((sum, item) => sum + item.successRate, 0) / lessonCompare.length;
  }, [lessonCompare]);

  const chartMaxNet = useMemo(() => {
    return Math.max(1, ...lessonCompare.map((item) => item.net));
  }, [lessonCompare]);

  const toggleLesson = (lesson: string) => {
    setSelectedLessons((prev) => {
      const next = prev.includes(lesson) ? prev.filter((item) => item !== lesson) : [...prev, lesson];
      return next;
    });
    setSelectedTopics((prev) => prev.filter((topic) => topicOptions.includes(topic)));
  };

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) => (prev.includes(topic) ? prev.filter((item) => item !== topic) : [...prev, topic]));
  };

  const clearFilters = () => {
    setSelectedLessons([]);
    setSelectedTopics([]);
  };

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
              <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground sm:text-3xl">
                <BarChart3 className="h-7 w-7 text-primary" />
                Grafik Karşılaştırma
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Seçtiğin tarih aralığında ders ve konu başarını görsel olarak karşılaştır.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-xl border border-border/60 bg-card/70 px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/60"
              />
              <span className="text-xs text-muted-foreground">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-xl border border-border/60 bg-card/70 px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/60"
              />
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-sm text-foreground hover:bg-foreground/[0.04]"
              >
                <ChevronLeft className="h-4 w-4" />
                Analize Dön
              </Link>
            </div>
          </div>
        </header>

        <section className="glass-panel rounded-[1.5rem] border-border/55 p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Filter className="h-4 w-4 text-primary" />
              Karşılaştırma Filtreleri
            </h2>
            <button
              onClick={clearFilters}
              className="rounded-lg border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
            >
              Seçimleri Temizle
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Dersler</p>
              <div className="flex flex-wrap gap-2">
                {lessonOptions.length === 0 && <p className="text-sm text-muted-foreground">Ders verisi bulunamadı.</p>}
                {lessonOptions.map((lesson) => {
                  const active = selectedLessons.includes(lesson);
                  return (
                    <button
                      key={lesson}
                      onClick={() => toggleLesson(lesson)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs transition",
                        active
                          ? "border-primary/60 bg-primary/15 text-primary"
                          : "border-border/60 bg-card/50 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {lesson}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Konular</p>
              <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto pr-1">
                {selectedLessons.length === 0 && (
                  <p className="text-sm text-muted-foreground">Önce en az bir ders seç, sonra konu karşılaştırması açılacak.</p>
                )}
                {selectedLessons.length > 0 && topicOptions.length === 0 && (
                  <p className="text-sm text-muted-foreground">Seçili derslerde konu verisi bulunamadı.</p>
                )}
                {topicOptions.map((topic) => {
                  const active = selectedTopics.includes(topic);
                  return (
                    <button
                      key={topic}
                      onClick={() => toggleTopic(topic)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs transition",
                        active
                          ? "border-primary/60 bg-primary/15 text-primary"
                          : "border-border/60 bg-card/50 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {topic}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3 lg:gap-6">
          <article className="glass-panel rounded-[1.5rem] border-border/55 p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Seçili Ders Özeti</p>
            {selectedLessons.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-border/60 bg-card/45 p-4 text-sm text-muted-foreground">
                Grafiklerin dolması için önce ders seç.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-3xl font-bold text-foreground">{selectedLessonSummary.net.toFixed(1)}</p>
                  <p className="text-sm text-muted-foreground">Toplam net</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-border/50 bg-card/45 p-3">
                    <p className="text-xs text-muted-foreground">Toplam soru</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{selectedLessonSummary.totalQuestions}</p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-card/45 p-3">
                    <p className="text-xs text-muted-foreground">Ortalama başarı</p>
                    <p className="mt-1 text-lg font-semibold text-primary">%{(selectedLessonSuccessAverage * 100).toFixed(1)}</p>
                  </div>
                </div>
              </div>
            )}
          </article>

          <article className="glass-panel rounded-[1.5rem] border-border/55 p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Doğru / Yanlış / Boş</p>
            {selectedLessons.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-border/60 bg-card/45 p-4 text-sm text-muted-foreground">
                Ders seçmeden dağılım grafiği gösterilmiyor.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {lessonDistribution.map((item) => (
                  <div key={`dist-${item.lesson}`} className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium text-foreground">{item.lesson}</span>
                      <span className="text-xs text-muted-foreground">{item.totalQuestions} soru</span>
                    </div>
                    <div className="flex h-3 overflow-hidden rounded-full bg-muted/30">
                      <div className="bg-emerald-500/80" style={{ width: `${item.correctPct}%` }} />
                      <div className="bg-rose-500/80" style={{ width: `${item.wrongPct}%` }} />
                      <div className="bg-amber-400/80" style={{ width: `${item.skippedPct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="glass-panel rounded-[1.5rem] border-border/55 p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Net Grafiği</p>
            {selectedLessons.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-border/60 bg-card/45 p-4 text-sm text-muted-foreground">
                Net sütun grafiği için ders seç.
              </p>
            ) : (
              <div className="mt-4 flex h-52 items-end gap-3">
                {lessonCompare.map((item) => (
                  <div key={`net-${item.lesson}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <div className="flex h-40 w-full items-end">
                      <div
                        className="w-full rounded-t-2xl bg-gradient-to-t from-primary to-primary/45"
                        style={{ height: `${Math.max(12, (item.net / chartMaxNet) * 100)}%` }}
                      />
                    </div>
                    <p className="text-center text-[11px] font-medium leading-4 text-foreground">{item.lesson}</p>
                    <p className="text-[10px] text-muted-foreground">{item.net.toFixed(1)} net</p>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2 lg:gap-6">
          <article className="glass-panel rounded-[1.5rem] border-border/55 p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Ders Karşılaştırması</h2>
            <div className="space-y-3">
              {lessonCompare.length === 0 && (
                <p className="rounded-xl border border-border/50 bg-card/50 p-4 text-sm text-muted-foreground">
                  Önce en az bir ders seç. Ders seçilmeden karşılaştırma otomatik dolmaz.
                </p>
              )}
              {lessonCompare.map((item) => (
                <div key={item.lesson} className="rounded-xl border border-border/40 bg-card/45 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{item.lesson}</p>
                    <span className="text-xs text-primary">%{(item.successRate * 100).toFixed(1)} başarı</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted/35">
                    <div className="h-full bg-emerald-500/80" style={{ width: `${item.successRate * 100}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      {item.correctCount}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5 text-rose-400" />
                      {item.wrongCount}
                    </span>
                    <span>Net: {item.net.toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="glass-panel rounded-[1.5rem] border-border/55 p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Konu Karşılaştırması</h2>
            <div className="space-y-3">
              {topicCompare.length === 0 && (
                <p className="rounded-xl border border-border/50 bg-card/50 p-4 text-sm text-muted-foreground">
                  Önce ders seç. İstersen sonra belirli konuları ayrıca işaretleyebilirsin.
                </p>
              )}
              {topicCompare.map((item) => (
                <div key={`${item.lesson}-${item.topic}`} className="rounded-xl border border-border/40 bg-card/45 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{item.topic}</p>
                    <span className="text-xs text-rose-300">%{(item.wrongRatio * 100).toFixed(1)} hata</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.lesson}</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/35">
                    <div className="h-full bg-rose-500/75" style={{ width: `${item.wrongRatio * 100}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      {item.correctCount}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5 text-rose-400" />
                      {item.wrongCount}
                    </span>
                    <span>Çözülen: {item.answeredCount}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>

      {loading && (
        <div className="fixed bottom-5 right-5 glass-panel rounded-xl px-3 py-2 text-xs text-muted-foreground">
          Grafik verileri hazırlanıyor...
        </div>
      )}
    </div>
  );
}

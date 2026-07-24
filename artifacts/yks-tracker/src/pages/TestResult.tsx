import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, CheckCircle2, Clock3, RefreshCw, Target, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ResultResponse = {
  testSessionId: number;
  isTestDeleted?: boolean;
  testName: string;
  completedAt: string;
  elapsedSeconds: number;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  successRate: number;
  lessonStats: Array<{
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
    answeredCount: number;
    wrongCount: number;
    wrongRatio: number;
    repeatPriority: "high" | "medium" | "low";
  }>;
};

function formatDuration(totalSeconds: number) {
  const hour = Math.floor(totalSeconds / 3600);
  const min = Math.floor((totalSeconds % 3600) / 60);
  const sec = totalSeconds % 60;
  if (hour > 0) return `${hour}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export default function TestResult() {
  const [match, params] = useRoute<{ id: string }>("/tests/:id/result");
  const testId = Number(params?.id ?? 0);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!match || !testId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tests/${testId}/result`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as ResultResponse;
      setResult(data);
    } catch (err) {
      setError("Deneme sonucu alınamadı.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [match, testId]);

  const completionDate = useMemo(() => {
    if (!result?.completedAt) return "-";
    const d = new Date(result.completedAt);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("tr-TR");
  }, [result?.completedAt]);

  if (!match) return null;

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="glass-panel rounded-2xl px-4 py-3 text-sm text-muted-foreground">
          Sonuçlar hazırlanıyor...
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-destructive">{error ?? "Sonuç bulunamadı."}</p>
        <Button variant="outline" onClick={() => void load()} className="rounded-xl gap-2">
          <RefreshCw className="h-4 w-4" /> Tekrar dene
        </Button>
      </div>
    );
  }

  return (
    <div className="relative min-h-full w-full overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-24 -top-20 h-72 w-72 rounded-full bg-primary/16 blur-3xl" />
        <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-accent/25 blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="glass-panel rounded-[1.6rem] border-border/60 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{result.testName} - Sonuç</h1>
              <p className="mt-1 text-sm text-muted-foreground">Tamamlama: {completionDate}</p>
              {result.isTestDeleted && (
                <p className="mt-1 text-xs text-amber-300">
                  Bu test silinmiş, sadece analiz özeti görüntüleniyor.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Link href="/tests">
                <Button variant="outline" className="rounded-xl gap-2">
                  <ArrowLeft className="h-4 w-4" /> Testlere dön
                </Button>
              </Link>
              {!result.isTestDeleted && (
                <Link href={`/tests/${result.testSessionId}?review=1`}>
                  <Button className="rounded-xl">Soruları Kontrol Et</Button>
                </Link>
              )}
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-4">
          {[
            { label: "Toplam", value: result.totalQuestions, icon: Target, tone: "text-primary bg-primary/15" },
            { label: "Doğru", value: result.correctCount, icon: CheckCircle2, tone: "text-emerald-400 bg-emerald-500/15" },
            { label: "Yanlış", value: result.wrongCount, icon: XCircle, tone: "text-rose-400 bg-rose-500/15" },
            { label: "Boş", value: result.skippedCount, icon: Target, tone: "text-amber-300 bg-amber-500/15" },
            { label: "Süre", value: formatDuration(result.elapsedSeconds), icon: Clock3, tone: "text-indigo-300 bg-indigo-500/15" },
          ].map((item) => (
            <article key={item.label} className="glass-panel rounded-[1.35rem] border-border/55 p-4 sm:p-5">
              <div className="mb-2 flex items-center gap-2">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.tone}`}>
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{item.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground sm:text-3xl">{item.value}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2 lg:gap-6">
          <article className="glass-panel rounded-[1.5rem] border-border/55 p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Ders Performansı</h2>
            <div className="space-y-3">
              {result.lessonStats.map((lesson) => (
                <div key={lesson.lesson} className="rounded-xl border border-border/40 bg-card/45 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{lesson.lesson}</p>
                    <span className="text-xs text-primary">%{(lesson.successRate * 100).toFixed(1)} başarı</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted/35">
                    <div className="h-full bg-emerald-500/80" style={{ width: `${lesson.successRate * 100}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Toplam: {lesson.totalQuestions}</span>
                    <span>Net: {lesson.net.toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="glass-panel rounded-[1.5rem] border-border/55 p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Tekrar Önerilen Konular</h2>
            <div className="space-y-3">
              {result.weakTopics.length === 0 && (
                <p className="rounded-xl border border-border/50 bg-card/50 p-4 text-sm text-muted-foreground">
                  Bu denemede tekrar önerisi çıkmadı. Güzel gidiyorsun.
                </p>
              )}
              {result.weakTopics.map((topic) => (
                <div key={`${topic.lesson}-${topic.topic}`} className="rounded-xl border border-border/40 bg-card/45 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{topic.topic}</p>
                      <p className="text-xs text-muted-foreground">{topic.lesson}</p>
                    </div>
                    <Badge variant="outline" className="border-rose-400/40 text-rose-300">
                      %{(topic.wrongRatio * 100).toFixed(0)} hata
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {topic.answeredCount} çözüm içinde {topic.wrongCount} yanlış
                  </p>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}

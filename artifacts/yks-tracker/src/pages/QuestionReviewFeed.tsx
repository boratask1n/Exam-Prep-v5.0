import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Pencil,
  Repeat2,
  RotateCcw,
  Search,
  XCircle,
  Youtube,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  formatVideoTimestampRange,
  getYoutubeWatchUrl,
} from "@/lib/youtubeEmbed";

type QuestionReviewItem = {
  id: number;
  imageUrl: string | null;
  description: string | null;
  lesson: string;
  topic: string | null;
  publisher: string | null;
  testName: string | null;
  testNo: string | null;
  choice: string | null;
  solutionUrl: string | null;
  solutionYoutubeUrl: string | null;
  solutionYoutubeStartSecond: number | null;
  solutionYoutubeEndSecond: number | null;
  category: string;
  source: string;
  status: "Cozulmedi" | "DogruCozuldu" | "YanlisHocayaSor";
  hasDrawing: boolean;
  isOsymBadge: boolean;
  isPremiumBadge: boolean;
  totalServed: number | null;
  totalReviewed: number | null;
  correctReviewCount: number | null;
  wrongReviewCount: number | null;
  repetitionStage: number | null;
  nextEligibleAt: string | null;
  updatedAt: string;
};

type FeedResponse = {
  items: QuestionReviewItem[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  algorithm?: {
    name: string;
    description: string;
  };
};

type Feedback = "again" | "correct" | "less_often" | "more_often";

const QUESTION_BADGE_OSYM = `${import.meta.env.BASE_URL}images/badge-osym.png`;
const QUESTION_BADGE_PREMIUM = `${import.meta.env.BASE_URL}images/badge-premium.png`;
const DrawingCanvas = lazy(() =>
  import("@/components/canvas/DrawingCanvas").then((module) => ({
    default: module.DrawingCanvas,
  })),
);

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function statusMeta(status: QuestionReviewItem["status"]) {
  if (status === "DogruCozuldu") {
    return {
      icon: CheckCircle2,
      label: "Doğru çözüldü",
      className: "text-emerald-600 dark:text-emerald-300",
    };
  }
  if (status === "YanlisHocayaSor") {
    return {
      icon: XCircle,
      label: "Yanlış / tekrar gerekli",
      className: "text-rose-600 dark:text-rose-300",
    };
  }
  return {
    icon: Clock3,
    label: "Çözülmedi",
    className: "text-amber-600 dark:text-amber-300",
  };
}

function QuestionBadgeImage({ type }: { type: "osym" | "premium" }) {
  return (
    <img
      src={type === "osym" ? QUESTION_BADGE_OSYM : QUESTION_BADGE_PREMIUM}
      alt={type === "osym" ? "ÖSYM badge" : "Kaliteli soru badge"}
      className="h-16 w-16 object-contain drop-shadow-[0_10px_20px_rgba(15,23,42,0.18)]"
      loading="lazy"
    />
  );
}

function ReviewQuestionCard({ question }: { question: QuestionReviewItem }) {
  const meta = statusMeta(question.status);
  const StatusIcon = meta.icon;
  const reviewCount = question.totalReviewed ?? 0;
  const wrongCount = question.wrongReviewCount ?? 0;
  const correctCount = question.correctReviewCount ?? 0;
  const youtubeUrl = getYoutubeWatchUrl(
    question.solutionYoutubeUrl || question.solutionUrl,
    question.solutionYoutubeStartSecond,
    question.solutionYoutubeEndSecond,
  );

  return (
    <article
      data-review-question-id={question.id}
      className="mx-auto flex h-[calc(100%-1rem)] w-full max-w-4xl snap-start flex-col overflow-hidden rounded-[2rem] border border-border/60 bg-card/92 shadow-[0_24px_80px_-46px_rgba(15,23,42,0.55)] backdrop-blur-xl"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/45 px-5 py-4 sm:px-7">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-primary"
            >
              {question.category}
            </Badge>
            <Badge
              variant="secondary"
              className="rounded-full bg-foreground/6 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em]"
            >
              {question.lesson}
            </Badge>
            {question.hasDrawing ? (
              <Badge
                variant="secondary"
                className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-violet-600 dark:text-violet-200"
              >
                Çizimli
              </Badge>
            ) : null}
          </div>
          <h2 className="text-2xl font-semibold tracking-[-0.04em] text-foreground sm:text-3xl">
            {question.topic || "Konu belirtilmedi"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {[
              question.publisher,
              question.testName,
              question.testNo ? `Test ${question.testNo}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Kaynak bilgisi yok"}
          </p>
        </div>
        <div
          className={cn(
            "flex items-center gap-2 rounded-full bg-foreground/5 px-3 py-2 text-xs font-medium",
            meta.className,
          )}
        >
          <StatusIcon className="h-4 w-4" />
          {meta.label}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-white/56 p-4 dark:bg-white/[0.035] sm:p-6">
        {question.isOsymBadge || question.isPremiumBadge ? (
          <div className="pointer-events-none absolute right-5 top-5 z-10 flex flex-col items-end gap-2">
            {question.isOsymBadge ? <QuestionBadgeImage type="osym" /> : null}
            {question.isPremiumBadge ? (
              <QuestionBadgeImage type="premium" />
            ) : null}
          </div>
        ) : null}

        {question.imageUrl ? (
          <img
            src={question.imageUrl}
            alt={`${question.lesson} sorusu`}
            className="max-h-full w-full max-w-3xl rounded-[1.4rem] object-contain shadow-[0_22px_60px_-44px_rgba(15,23,42,0.55)]"
            loading="lazy"
          />
        ) : (
          <div className="flex min-h-[28vh] w-full max-w-2xl items-center justify-center rounded-[1.4rem] border border-dashed border-border/70 bg-background/72 p-8 text-center text-muted-foreground">
            Bu soru için görsel yok. Açıklama ve meta veriler üzerinden tekrar
            edebilirsin.
          </div>
        )}
      </div>

      <div className="grid gap-3 border-t border-border/45 px-5 py-3 text-sm text-muted-foreground sm:grid-cols-[1fr_auto] sm:px-7">
        <div>
          <p className="line-clamp-2">
            {question.description || "Açıklama eklenmemiş."}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span>
              Tekrar geçmişi: {reviewCount} değerlendirme · {correctCount} doğru
              · {wrongCount} tekrar
            </span>
            {youtubeUrl ? (
              <button
                type="button"
                onClick={() =>
                  window.open(youtubeUrl, "_blank", "noopener,noreferrer")
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-red-300/50 bg-red-500/10 px-2.5 py-1 font-medium text-red-700 transition-colors hover:bg-red-500/15 dark:border-red-400/20 dark:text-red-200"
              >
                <Youtube className="h-3.5 w-3.5" />
                {formatVideoTimestampRange(
                  question.solutionYoutubeStartSecond,
                  question.solutionYoutubeEndSecond,
                )}
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-foreground/5 px-3 py-1">
            Aşama {question.repetitionStage ?? 0}
          </span>
          <span className="rounded-full bg-foreground/5 px-3 py-1">
            {question.source}
          </span>
        </div>
      </div>
    </article>
  );
}

export default function QuestionReviewFeed() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const recentIdsRef = useRef<number[]>([]);
  const lastServedAtRef = useRef<Record<number, number>>({});
  const questionsRef = useRef<QuestionReviewItem[]>([]);
  const [questions, setQuestions] = useState<QuestionReviewItem[]>([]);
  const [currentVisibleId, setCurrentVisibleId] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [reloadSeed, setReloadSeed] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [algorithmText, setAlgorithmText] = useState(
    "Yanlış ve zamanı gelen soruları öne alır.",
  );
  const [feedbackPending, setFeedbackPending] = useState<Feedback | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [showCanvas, setShowCanvas] = useState(false);
  const [tempDrawings, setTempDrawings] = useState<Record<number, string>>({});
  const debouncedSearch = useDebouncedValue(searchInput, 250);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    return () => {
      setTempDrawings({});
    };
  }, []);

  const fetchBatch = useCallback(
    async (replace: boolean) => {
      if (replace) setIsLoading(true);
      else setIsLoadingMore(true);

      try {
        const excludeIds = Array.from(
          new Set([
            ...(replace
              ? []
              : questionsRef.current.map((question) => question.id)),
            ...recentIdsRef.current.slice(-24),
          ]),
        );
        const query = new URLSearchParams({ limit: "8" });
        if (debouncedSearch.trim()) query.set("search", debouncedSearch.trim());
        if (excludeIds.length > 0)
          query.set("excludeIds", excludeIds.join(","));

        const response = await requestJson<FeedResponse>(
          `/api/questions/review/feed?${query.toString()}`,
        );
        setAlgorithmText(
          response.algorithm?.description ||
            "Yanlış ve zamanı gelen soruları öne alır.",
        );
        setHasMore(response.pagination.hasMore || response.items.length > 0);
        setQuestions((current) => {
          if (replace) return response.items;
          const existingIds = new Set(current.map((question) => question.id));
          return [
            ...current,
            ...response.items.filter(
              (question) => !existingIds.has(question.id),
            ),
          ];
        });
      } finally {
        if (replace) setIsLoading(false);
        else setIsLoadingMore(false);
      }
    },
    [debouncedSearch],
  );

  useEffect(() => {
    recentIdsRef.current = [];
    lastServedAtRef.current = {};
    setCurrentVisibleId(null);
    setFeedbackPending(null);
    setNotice(null);
    setShowCanvas(false);
    void fetchBatch(true);
  }, [fetchBatch, reloadSeed]);

  useEffect(() => {
    const root = viewportRef.current;
    if (!root || questions.length === 0) return;

    const targets = Array.from(
      root.querySelectorAll<HTMLElement>("[data-review-question-id]"),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const rawId = visible?.target.getAttribute("data-review-question-id");
        const nextId = rawId ? Number.parseInt(rawId, 10) : null;
        if (nextId && Number.isFinite(nextId)) setCurrentVisibleId(nextId);
      },
      { root, threshold: [0.4, 0.6, 0.78, 0.92] },
    );

    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [questions]);

  useEffect(() => {
    if (!currentVisibleId) return;
    setFeedbackPending(null);
    recentIdsRef.current = [
      ...recentIdsRef.current.filter((id) => id !== currentVisibleId),
      currentVisibleId,
    ].slice(-30);

    const now = Date.now();
    if (
      !lastServedAtRef.current[currentVisibleId] ||
      now - lastServedAtRef.current[currentVisibleId] >= 45000
    ) {
      lastServedAtRef.current[currentVisibleId] = now;
      void requestJson(`/api/questions/review/serve/${currentVisibleId}`, {
        method: "POST",
      });
    }

    const visibleIndex = questions.findIndex(
      (question) => question.id === currentVisibleId,
    );
    if (visibleIndex >= questions.length - 3 && hasMore && !isLoadingMore) {
      void fetchBatch(false);
    }
  }, [currentVisibleId, fetchBatch, hasMore, isLoadingMore, questions]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 2300);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const currentQuestion = useMemo(
    () =>
      questions.find((question) => question.id === currentVisibleId) ?? null,
    [currentVisibleId, questions],
  );

  const sendFeedback = useCallback(
    async (feedback: Feedback) => {
      if (!currentQuestion || feedbackPending) return;
      setFeedbackPending(feedback);
      try {
        await requestJson(
          `/api/questions/review/feedback/${currentQuestion.id}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ feedback }),
          },
        );

        setNotice({
          tone: "success",
          text:
            feedback === "correct"
              ? "Harika, bu soru daha uzun aralıkla geri gelecek."
              : feedback === "again"
                ? "Tamam, bu soruyu kısa süre sonra tekrar göstereceğim."
                : feedback === "more_often"
                  ? "Bu soru biraz daha sık gelecek."
                  : "Bu soru daha seyrek gelecek.",
        });
        lastServedAtRef.current[currentQuestion.id] = Date.now();
        setQuestions((current) =>
          current.filter((question) => question.id !== currentQuestion.id),
        );
        setTempDrawings((current) => {
          if (!(currentQuestion.id in current)) return current;
          const next = { ...current };
          delete next[currentQuestion.id];
          return next;
        });
        setShowCanvas(false);
      } catch {
        setNotice({
          tone: "error",
          text: "Geri bildirim kaydedilemedi, tekrar deneyebilirsin.",
        });
      } finally {
        setFeedbackPending(null);
      }
    },
    [currentQuestion, feedbackPending],
  );

  return (
    <PageShell maxWidthClassName="max-w-6xl" contentClassName="gap-4">
      <PageHeader
        icon={<BookOpenCheck className="h-5 w-5" />}
        title="Soru Tekrarı"
        description="Yanlış, çözülmemiş ve zamanı gelen soruları aralıklı tekrar mantığıyla önüne getirir."
        actions={
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => setReloadSeed((value) => value + 1)}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Yenile
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] border border-border/55 bg-card/72 px-4 py-3 shadow-sm backdrop-blur-xl">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Repeat2 className="h-4 w-4 text-primary" />
          <span>{algorithmText}</span>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Ders, konu veya kaynak ara..."
            className="h-10 rounded-xl bg-background pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-[55vh] items-center justify-center rounded-[1.6rem] border border-border/50 bg-card/72">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : questions.length === 0 ? (
        <div className="flex min-h-[55vh] flex-col items-center justify-center rounded-[1.6rem] border border-border/50 bg-card/72 p-8 text-center">
          <BookOpenCheck className="h-12 w-12 text-primary/80" />
          <h2 className="mt-4 text-xl font-semibold">
            Tekrar akışı şimdilik boş
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Soru ekleyip test çözdükçe ya da sorulara yanlış/doğru durum
            verdikçe burası otomatik dolacak.
          </p>
        </div>
      ) : (
        <div className="relative">
          {notice ? (
            <div className="pointer-events-none fixed left-1/2 top-5 z-40 -translate-x-1/2">
              <div
                className={cn(
                  "rounded-full px-4 py-2 text-xs font-medium shadow-[0_18px_50px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xl",
                  notice.tone === "success"
                    ? "border border-emerald-300/60 bg-emerald-50/90 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/12 dark:text-emerald-100"
                    : "border border-rose-300/60 bg-rose-50/90 text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/12 dark:text-rose-100",
                )}
              >
                {notice.text}
              </div>
            </div>
          ) : null}

          <div
            ref={viewportRef}
            className="h-[72vh] snap-y snap-mandatory overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {questions.map((question) => (
              <div key={question.id} className="h-full py-2 sm:py-3">
                <ReviewQuestionCard question={question} />
              </div>
            ))}
            <div className="flex min-h-16 items-center justify-center py-4 text-sm text-muted-foreground">
              {isLoadingMore
                ? "Sıradaki sorular hazırlanıyor..."
                : hasMore
                  ? "Kaydırmaya devam et, yeni sorular geliyor."
                  : "Şimdilik tekrar kuyruğunun sonuna geldin."}
            </div>
          </div>

          {currentQuestion ? (
            <div className="pointer-events-none fixed bottom-5 right-5 z-30 sm:bottom-6 sm:right-6">
              <div className="pointer-events-auto flex max-w-[86vw] flex-col items-end gap-2 sm:max-w-none">
                <span className="rounded-full bg-slate-900/6 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-white/10 dark:text-white/60">
                  {currentQuestion.lesson}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-full border-slate-300/70 bg-white/92 px-4 text-slate-700 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl hover:bg-slate-50/95 dark:border-slate-500/20 dark:bg-[#120f1fcc]/95 dark:text-slate-100 dark:hover:bg-slate-500/12"
                  onClick={() => setShowCanvas(true)}
                  disabled={!currentQuestion.imageUrl}
                >
                  <Pencil className="mr-1.5 h-4 w-4" />
                  {currentQuestion.imageUrl ? "Kalem" : "Görsel yok"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-full border-rose-300/70 bg-white/92 px-4 text-rose-700 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl hover:bg-rose-50/95 dark:border-rose-500/20 dark:bg-[#120f1fcc]/95 dark:text-rose-100 dark:hover:bg-rose-500/12"
                  onClick={() => void sendFeedback("again")}
                  disabled={feedbackPending !== null}
                >
                  {feedbackPending === "again"
                    ? "Kaydediliyor..."
                    : "Tekrar getir"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-full border-emerald-300/70 bg-white/92 px-4 text-emerald-700 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl hover:bg-emerald-50/95 dark:border-emerald-500/20 dark:bg-[#120f1fcc]/95 dark:text-emerald-100 dark:hover:bg-emerald-500/12"
                  onClick={() => void sendFeedback("correct")}
                  disabled={feedbackPending !== null}
                >
                  {feedbackPending === "correct" ? "Kaydediliyor..." : "Çözdüm"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-full border-violet-300/70 bg-white/92 px-4 text-violet-800 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl hover:bg-violet-50/95 dark:border-violet-500/20 dark:bg-[#120f1fcc]/95 dark:text-violet-100 dark:hover:bg-violet-500/12"
                  onClick={() => void sendFeedback("less_often")}
                  disabled={feedbackPending !== null}
                >
                  {feedbackPending === "less_often"
                    ? "Kaydediliyor..."
                    : "Daha seyrek göster"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-full border-sky-300/70 bg-white/92 px-4 text-sky-800 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl hover:bg-sky-50/95 dark:border-sky-500/20 dark:bg-[#120f1fcc]/95 dark:text-sky-100 dark:hover:bg-sky-500/12"
                  onClick={() => void sendFeedback("more_often")}
                  disabled={feedbackPending !== null}
                >
                  {feedbackPending === "more_often"
                    ? "Kaydediliyor..."
                    : "Daha sık göster"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {showCanvas && currentQuestion ? (
        <div className="fixed inset-0 z-50 bg-foreground/25 backdrop-blur-md">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              </div>
            }
          >
            <DrawingCanvas
              questionId={currentQuestion.id}
              imageUrl={currentQuestion.imageUrl}
              initialData={tempDrawings[currentQuestion.id]}
              noSave
              onTempSave={(data) =>
                setTempDrawings((current) => ({
                  ...current,
                  [currentQuestion.id]: data,
                }))
              }
              onClose={() => setShowCanvas(false)}
            />
          </Suspense>
        </div>
      ) : null}
    </PageShell>
  );
}

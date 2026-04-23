import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import {
  Question,
  QuestionCategory,
  QuestionSource,
  QuestionStatus,
  useDeleteQuestion,
  useGetDrawing,
  useGetFilterOptions,
  useListQuestions,
  useUpdateQuestion,
} from "@workspace/api-client-react";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import {
  Book,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  XCircle,
  Youtube,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PageHeader,
  PageSection,
  PageShell,
} from "@/components/layout/PageShell";
import { useToast } from "@/hooks/use-toast";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { getLessonsForCategory, getTopicsForLesson } from "@/lib/lessonTopics";
import {
  formatVideoTimestampRange,
  getYoutubeWatchUrl,
} from "@/lib/youtubeEmbed";

const QuestionFormDialog = lazy(() =>
  import("@/components/QuestionFormDialog").then((module) => ({
    default: module.QuestionFormDialog,
  })),
);

const DrawingCanvas = lazy(() =>
  import("@/components/canvas/DrawingCanvas").then((module) => ({
    default: module.DrawingCanvas,
  })),
);

type QuestionBadgeType = "osym" | "premium";
type Filters = {
  category?: QuestionCategory;
  source?: QuestionSource;
  lesson?: string;
  topic?: string;
  status?: QuestionStatus;
  isOsymBadge?: boolean;
  isPremiumBadge?: boolean;
};

const PAGE_SIZE = 20;
const QUESTION_BADGE_OSYM = `${import.meta.env.BASE_URL}images/badge-osym.png`;
const QUESTION_BADGE_PREMIUM = `${import.meta.env.BASE_URL}images/badge-premium.png`;

const STATUS_LABELS: Record<QuestionStatus, string> = {
  [QuestionStatus.Cozulmedi]: "Beklemede",
  [QuestionStatus.DogruCozuldu]: "Doğru",
  [QuestionStatus.YanlisHocayaSor]: "Yanlış",
};

const StatusIcon = memo(function StatusIcon({ status }: { status: string }) {
  if (status === QuestionStatus.DogruCozuldu) {
    return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  }
  if (status === QuestionStatus.YanlisHocayaSor) {
    return <XCircle className="h-4 w-4 text-destructive" />;
  }
  return <Clock className="h-4 w-4 text-muted-foreground" />;
});

const QuestionPreviewBadge = memo(function QuestionPreviewBadge({
  type,
}: {
  type: QuestionBadgeType;
}) {
  return (
    <img
      src={type === "osym" ? QUESTION_BADGE_OSYM : QUESTION_BADGE_PREMIUM}
      alt={type === "osym" ? "ÖSYM çıkmış sorular" : "Kaliteli Soru"}
      className="h-[58px] w-[58px] object-contain"
      loading="lazy"
      decoding="async"
    />
  );
});

const LazyImage = memo(function LazyImage({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center">
      {isVisible ? (
        <img
          src={src}
          alt={alt}
          className="max-h-full max-w-full rounded object-contain"
          loading="lazy"
          decoding="async"
          fetchPriority="low"
        />
      ) : (
        <div className="h-full w-full rounded bg-muted/30" />
      )}
    </div>
  );
});

function CanvasModal({
  questionId,
  imageUrl,
  onClose,
}: {
  questionId: number;
  imageUrl?: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useGetDrawing(questionId, {
    query: { staleTime: 30_000, refetchOnWindowFocus: false } as any,
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/92">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-950"
      >
        Kapat
      </button>
      {isLoading ? (
        <div className="flex h-full w-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-white" />
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="flex h-full w-full items-center justify-center text-white">
              Yükleniyor...
            </div>
          }
        >
          <DrawingCanvas
            questionId={questionId}
            imageUrl={imageUrl}
            initialData={data?.canvasData}
            onClose={onClose}
          />
        </Suspense>
      )}
    </div>
  );
}

const QuestionCard = memo(function QuestionCard({
  question,
  onOpenCanvas,
  onEdit,
  onDelete,
  onToggleBadge,
}: {
  question: Question;
  onOpenCanvas: (id: number) => void;
  onEdit: (question: Question) => void;
  onDelete: (id: number) => void;
  onToggleBadge: (question: Question, badgeType: QuestionBadgeType) => void;
}) {
  const youtubeUrl = getYoutubeWatchUrl(
    question.solutionYoutubeUrl || question.solutionUrl,
    question.solutionYoutubeStartSecond,
    question.solutionYoutubeEndSecond,
  );
  const timestamp = formatVideoTimestampRange(
    question.solutionYoutubeStartSecond,
    question.solutionYoutubeEndSecond,
  );

  return (
    <article
      onClick={() => onOpenCanvas(question.id)}
      className={cn(
        "group relative flex min-h-[340px] cursor-pointer flex-col overflow-hidden rounded-2xl border border-border/40 bg-card shadow-sm transition-colors duration-150 hover:border-primary/50",
        "[content-visibility:auto] [contain-intrinsic-size:340px] [contain:layout_paint_style]",
      )}
    >
      <div className="relative flex h-40 items-center justify-center overflow-hidden border-b border-border/40 bg-muted/20 p-3">
        {question.imageUrl ? (
          <LazyImage src={question.imageUrl} alt={question.topic || "Soru"} />
        ) : (
          <span className="text-base font-medium text-muted-foreground/30">
            Görsel Yok
          </span>
        )}

        <div className="absolute left-2 top-2 flex flex-col gap-1">
          <Badge
            variant="secondary"
            className="rounded-lg border-border/50 bg-background/95 px-2 py-0.5 text-xs shadow-sm"
          >
            {question.category}
          </Badge>
          {question.hasDrawing ? (
            <Badge className="rounded-lg bg-primary/90 px-1.5 py-0 text-[10px] text-white shadow-sm">
              Çizim
            </Badge>
          ) : null}
        </div>

        {(question.isOsymBadge || question.isPremiumBadge) && (
          <div className="pointer-events-none absolute right-2 top-10 z-10 flex flex-col items-end gap-1.5">
            {question.isOsymBadge ? <QuestionPreviewBadge type="osym" /> : null}
            {question.isPremiumBadge ? (
              <QuestionPreviewBadge type="premium" />
            ) : null}
          </div>
        )}

        <div
          className="absolute right-2 top-2 flex gap-1.5"
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4c6fff] text-white shadow-sm transition-colors hover:bg-[#3f62f4]"
              >
                <Plus className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 rounded-2xl border-border/60 bg-background p-2 shadow-md"
            >
              <DropdownMenuItem
                className="rounded-xl py-2"
                onClick={() => void onToggleBadge(question, "osym")}
              >
                <span className="mr-2 inline-flex h-2.5 w-2.5 rounded-full bg-[#d85d10]" />
                {question.isOsymBadge
                  ? "ÖSYM badge'ini kaldır"
                  : "ÖSYM çıkmış sorular ekle"}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="rounded-xl py-2"
                onClick={() => void onToggleBadge(question, "premium")}
              >
                <span className="mr-2 inline-flex h-2.5 w-2.5 rounded-full bg-[#4c6fff]" />
                {question.isPremiumBadge
                  ? "Kaliteli Soru badge'ini kaldır"
                  : "Kaliteli Soru badge'i ekle"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={() => onEdit(question)}
            className="rounded-lg bg-primary/90 p-1.5 text-white shadow-sm transition-colors hover:bg-primary"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(question.id)}
            className="rounded-lg bg-destructive/90 p-1.5 text-white shadow-sm transition-colors hover:bg-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-1.5 flex items-start justify-between gap-3">
          <h3 className="line-clamp-1 font-semibold text-foreground">
            {question.lesson}
          </h3>
          <StatusIcon status={question.status} />
        </div>
        <p className="mb-1 line-clamp-1 text-sm text-muted-foreground">
          {question.topic || "Konu belirtilmedi"}
        </p>
        {question.description ? (
          <p className="mb-2 line-clamp-2 text-xs italic text-muted-foreground/70">
            {question.description}
          </p>
        ) : null}

        {youtubeUrl ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              window.open(youtubeUrl, "_blank", "noopener,noreferrer");
            }}
            className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-red-300/50 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-700 transition-colors hover:bg-red-500/15 dark:border-red-400/20 dark:text-red-200"
          >
            <Youtube className="h-3.5 w-3.5" />
            {timestamp}
          </button>
        ) : null}

        <div className="mt-auto flex items-center justify-between border-t border-border/30 pt-3 text-xs text-muted-foreground/70">
          <span className="flex min-w-0 items-center gap-1">
            <Book className="h-3 w-3 shrink-0" />
            <span className="truncate">{question.publisher || "—"}</span>
          </span>
          <span
            className={cn(
              "flex items-center gap-1 font-medium",
              question.choice ? "text-primary/80" : "",
            )}
          >
            {question.choice ? (
              `Şık: ${question.choice}`
            ) : (
              <>
                <FileText className="h-3 w-3" />
                {question.source}
              </>
            )}
          </span>
        </div>
      </div>
    </article>
  );
});

export default function Pool() {
  const [filters, setFilters] = useState<Filters>({});
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [canvasQuestionId, setCanvasQuestionId] = useState<number | null>(null);
  const [editQuestion, setEditQuestion] = useState<Question | null>(null);

  const debouncedSearch = useDebouncedValue(searchInput, 250);
  const offset = (page - 1) * PAGE_SIZE;

  const questionQuery = useMemo(
    () =>
      ({
        ...filters,
        search: debouncedSearch.trim() || undefined,
        offset,
        limit: PAGE_SIZE,
      }) as any,
    [
      debouncedSearch,
      filters.category,
      filters.isOsymBadge,
      filters.isPremiumBadge,
      filters.lesson,
      filters.source,
      filters.status,
      filters.topic,
      offset,
    ],
  );

  const {
    data: response,
    isLoading,
    isFetching,
  } = useListQuestions(questionQuery, {
    query: {
      placeholderData: keepPreviousData,
      staleTime: 20_000,
      refetchOnWindowFocus: false,
    } as any,
  });
  const questions = ((response as any)?.items ?? []) as Question[];
  const pagination = (response as any)?.pagination as
    | { total: number; limit: number; offset: number }
    | undefined;

  const { data: options } = useGetFilterOptions({
    query: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
    } as any,
  });

  const deleteMutation = useDeleteQuestion();
  const updateQuestionMutation = useUpdateQuestion();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const activeQuestion = useMemo(
    () => questions.find((question) => question.id === canvasQuestionId),
    [canvasQuestionId, questions],
  );

  const availableLessons = useMemo(
    () =>
      filters.category
        ? getLessonsForCategory(filters.category).map((lesson) => lesson.name)
        : ((options as any)?.lessons ?? []),
    [filters.category, options],
  );

  const availableTopics = useMemo(
    () =>
      filters.category && filters.lesson
        ? getTopicsForLesson(filters.category, filters.lesson)
        : ((options as any)?.topics ?? []),
    [filters.category, filters.lesson, options],
  );

  const stats = useMemo(() => {
    let solved = 0;
    let wrong = 0;
    for (const question of questions) {
      if (question.status === QuestionStatus.DogruCozuldu) solved += 1;
      if (question.status === QuestionStatus.YanlisHocayaSor) wrong += 1;
    }
    const visible = questions.length;
    const unsolved = Math.max(0, visible - solved - wrong);
    const solvedPct = visible ? Math.round((solved / visible) * 100) : 0;
    const wrongPct = visible ? Math.round((wrong / visible) * 100) : 0;

    return {
      visible,
      total: pagination?.total ?? visible,
      solved,
      wrong,
      unsolved,
      solvedPct,
      wrongPct,
      unsolvedPct: visible ? Math.max(0, 100 - solvedPct - wrongPct) : 100,
    };
  }, [pagination?.total, questions]);

  const invalidateQuestions = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/filters/options"] });
  }, [queryClient]);

  const updateFilter = useCallback((patch: Partial<Filters>) => {
    setPage(1);
    setFilters((current) => ({ ...current, ...patch }));
  }, []);

  const clearFilters = useCallback(() => {
    setPage(1);
    setFilters({});
    setSearchInput("");
  }, []);

  const deleteQuestion = useCallback(
    async (id: number) => {
      if (!window.confirm("Bu soruyu silmek istiyor musun?")) return;
      await deleteMutation.mutateAsync({ id });
      invalidateQuestions();
      toast({ title: "Soru silindi" });
    },
    [deleteMutation, invalidateQuestions, toast],
  );

  const toggleQuestionBadge = useCallback(
    async (question: Question, badgeType: QuestionBadgeType) => {
      const nextValue =
        badgeType === "osym"
          ? !question.isOsymBadge
          : !question.isPremiumBadge;

      await updateQuestionMutation.mutateAsync({
        id: question.id,
        data: {
          isOsymBadge:
            badgeType === "osym" ? nextValue : question.isOsymBadge,
          isPremiumBadge:
            badgeType === "premium" ? nextValue : question.isPremiumBadge,
        },
      });

      invalidateQuestions();
      toast({ title: nextValue ? "Badge eklendi" : "Badge kaldırıldı" });
    },
    [invalidateQuestions, toast, updateQuestionMutation],
  );

  const hasActiveFilters =
    Boolean(filters.category) ||
    Boolean(filters.lesson) ||
    Boolean(filters.topic) ||
    Boolean(filters.status) ||
    Boolean(filters.source) ||
    Boolean(filters.isOsymBadge) ||
    Boolean(filters.isPremiumBadge) ||
    Boolean(searchInput);

  const pageCount = Math.max(1, Math.ceil((pagination?.total ?? 0) / PAGE_SIZE));

  return (
    <PageShell>
      <PageHeader
        icon={<Book className="h-5 w-5" />}
        title="Soru Havuzu"
        className="backdrop-blur-none bg-white/92 dark:bg-slate-950/88"
        description="Arşivlediğin tüm soruları, badge'leri ve çözüm durumlarını tek yerde yönet."
        actions={
          <Suspense
            fallback={
              <Button className="rounded-xl" disabled>
                Yükleniyor...
              </Button>
            }
          >
            <QuestionFormDialog onSaved={invalidateQuestions} />
          </Suspense>
        }
      />

      <PageSection className="gap-3 backdrop-blur-none bg-white/90 dark:bg-slate-950/84">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-medium text-muted-foreground">
            {stats.visible} görünen soru
            {stats.total !== stats.visible ? ` / ${stats.total} toplam` : ""}
          </span>
          {isFetching ? (
            <span className="text-xs text-muted-foreground/70">
              Güncelleniyor...
            </span>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium">
            <span className="text-green-500">✓ {stats.solved} doğru</span>
            <span className="text-destructive">✕ {stats.wrong} yanlış</span>
            <span className="text-muted-foreground">
              • {stats.unsolved} çözülmedi
            </span>
          </div>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="flex h-full">
            <div
              className="bg-green-500"
              style={{ width: `${stats.solvedPct}%` }}
            />
            <div
              className="bg-destructive"
              style={{ width: `${stats.wrongPct}%` }}
            />
            <div
              className="bg-muted-foreground/30"
              style={{ width: `${stats.unsolvedPct}%` }}
            />
          </div>
        </div>
      </PageSection>

      <PageSection className="backdrop-blur-none bg-white/90 dark:bg-slate-950/84">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => {
                setPage(1);
                setSearchInput(event.target.value);
              }}
              placeholder="Ders, konu veya açıklama ara"
              className="h-9 rounded-xl border-border/50 bg-background pl-9"
            />
          </div>

          <Select
            value={filters.category || "ALL"}
            onValueChange={(value) =>
              updateFilter({
                category:
                  value === "ALL" ? undefined : (value as QuestionCategory),
                lesson: undefined,
                topic: undefined,
              })
            }
          >
            <SelectTrigger className="h-9 w-36 rounded-xl border-border/50 bg-background">
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tüm Kategoriler</SelectItem>
              {Object.values(QuestionCategory).map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.lesson || "ALL"}
            onValueChange={(value) =>
              updateFilter({
                lesson: value === "ALL" ? undefined : value,
                topic: undefined,
              })
            }
          >
            <SelectTrigger className="h-9 w-44 rounded-xl border-border/50 bg-background">
              <SelectValue placeholder="Ders" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tüm Dersler</SelectItem>
              {availableLessons.map((lesson: string) => (
                <SelectItem key={lesson} value={lesson}>
                  {lesson}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.topic || "ALL"}
            onValueChange={(value) =>
              updateFilter({ topic: value === "ALL" ? undefined : value })
            }
            disabled={!filters.lesson}
          >
            <SelectTrigger className="h-9 w-44 rounded-xl border-border/50 bg-background">
              <SelectValue
                placeholder={filters.lesson ? "Konu" : "Önce ders seçin"}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tüm Konular</SelectItem>
              {availableTopics.map((topic: string) => (
                <SelectItem key={topic} value={topic}>
                  {topic}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.source || "ALL"}
            onValueChange={(value) =>
              updateFilter({
                source: value === "ALL" ? undefined : (value as QuestionSource),
              })
            }
          >
            <SelectTrigger className="h-9 w-40 rounded-xl border-border/50 bg-background">
              <SelectValue placeholder="Kaynak" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tüm Kaynaklar</SelectItem>
              {Object.values(QuestionSource).map((source) => (
                <SelectItem key={source} value={source}>
                  {source}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Durum:</span>
            <Button
              type="button"
              size="sm"
              variant={!filters.status ? "default" : "outline"}
              className="h-8 rounded-lg"
              onClick={() => updateFilter({ status: undefined })}
            >
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              Tümü
            </Button>
            {Object.values(QuestionStatus).map((status) => (
              <Button
                key={status}
                type="button"
                size="sm"
                variant={filters.status === status ? "default" : "outline"}
                className="h-8 rounded-lg"
                onClick={() => updateFilter({ status })}
              >
                <StatusIcon status={status} />
                {STATUS_LABELS[status]}
              </Button>
            ))}
          </div>

          <Select
            value={
              filters.isOsymBadge && filters.isPremiumBadge
                ? "both"
                : filters.isOsymBadge
                  ? "osym"
                  : filters.isPremiumBadge
                    ? "premium"
                    : "ALL"
            }
            onValueChange={(value) =>
              updateFilter({
                isOsymBadge:
                  value === "osym" || value === "both" ? true : undefined,
                isPremiumBadge:
                  value === "premium" || value === "both" ? true : undefined,
              })
            }
          >
            <SelectTrigger className="h-9 w-44 rounded-xl border-border/50 bg-background">
              <SelectValue placeholder="Badge" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Filtresiz Badge</SelectItem>
              <SelectItem value="osym">Sadece ÖSYM</SelectItem>
              <SelectItem value="premium">Kaliteli Soru</SelectItem>
              <SelectItem value="both">Her İkisi</SelectItem>
            </SelectContent>
          </Select>

          {hasActiveFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-9 rounded-xl text-muted-foreground hover:text-foreground"
            >
              Temizle
            </Button>
          ) : null}
        </div>
      </PageSection>

      {isLoading ? (
        <PageSection className="flex min-h-[320px] items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
        </PageSection>
      ) : questions.length === 0 ? (
        <PageSection className="flex min-h-[360px] flex-col items-center justify-center opacity-80">
          <img
            src={`${import.meta.env.BASE_URL}images/empty-state.png`}
            alt="Boş"
            className="mb-6 h-56 w-56 object-contain opacity-50"
            loading="lazy"
          />
          <h3 className="font-display text-xl font-medium text-foreground">
            Buralar Çok Sessiz
          </h3>
          <p className="mt-2 max-w-sm text-center text-muted-foreground">
            Filtrelere uygun soru bulunamadı. Yeni soru ekleyerek havuzunu
            genişletebilirsin.
          </p>
        </PageSection>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 pb-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {questions.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                onOpenCanvas={setCanvasQuestionId}
                onEdit={setEditQuestion}
                onDelete={deleteQuestion}
                onToggleBadge={toggleQuestionBadge}
              />
            ))}
          </div>

          {pagination && pagination.total > PAGE_SIZE ? (
            <PageSection className="flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || isFetching}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Önceki
              </Button>
              <span className="text-sm text-muted-foreground">
                Sayfa {page} / {pageCount}
              </span>
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() =>
                  setPage((current) => Math.min(pageCount, current + 1))
                }
                disabled={page >= pageCount || isFetching}
              >
                Sonraki
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </PageSection>
          ) : null}
        </>
      )}

      {canvasQuestionId != null ? (
        <CanvasModal
          questionId={canvasQuestionId}
          imageUrl={activeQuestion?.imageUrl}
          onClose={() => setCanvasQuestionId(null)}
        />
      ) : null}

      <Suspense fallback={null}>
        <QuestionFormDialog
          key={editQuestion?.id ?? "edit"}
          question={editQuestion ?? undefined}
          trigger={null}
          open={editQuestion != null}
          onOpenChange={(open) => {
            if (!open) setEditQuestion(null);
          }}
          onSaved={() => {
            setEditQuestion(null);
            invalidateQuestions();
          }}
        />
      </Suspense>
    </PageShell>
  );
}

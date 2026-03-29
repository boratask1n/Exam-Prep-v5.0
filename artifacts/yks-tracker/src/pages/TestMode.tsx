import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetTest,
  useUpdateTest,
  useUpdateTestQuestionStatus,
  getListQuestionsQueryKey,
  getListTestsQueryKey,
  getGetTestQueryKey,
  QuestionStatus,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DrawingCanvas } from "@/components/canvas/DrawingCanvas";
import {
  ArrowLeft,
  Paintbrush,
  Pencil,
  Eraser,
  Trash2,
  Timer,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Video,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  testDraftKey,
  testReviewKey,
  type TestReviewSnapshotV1,
} from "@/lib/testSessionStorage";
import { getYoutubeEmbedSrc } from "@/lib/youtubeEmbed";

// ─── Types ────────────────────────────────────────────────────────────────────
type QStatus = "Cozulmedi" | "DogruCozuldu" | "YanlisHocayaSor";
interface Question {
  id: number;
  lesson: string;
  topic?: string | null;
  category: string;
  choice?: string | null;
  imageUrl?: string | null;
  status: string;
  description?: string | null;
  solutionUrl?: string | null;
}
interface LessonGroup {
  lesson: string;
  questions: { q: Question; index: number }[];
}
interface CanvasPoint {
  x: number;
  y: number;
}
interface InlineStroke {
  tool: "pen" | "eraser";
  color: string;
  width: number;
  points: CanvasPoint[];
}
type InlineEraserMode = "area" | "stroke";

interface TestDraftV1 {
  version: 1;
  answers: Record<number, string>;
  currentIndex: number;
  tempDrawings: Record<number, string>;
  inlineDrawingsByQuestion: Record<number, InlineStroke[]>;
  elapsed: number;
  collapsedLessons: Record<string, boolean>;
  inlineDrawEnabled: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const CHOICES = ["A", "B", "C", "D", "E"];

/** Gözden geçirme: işaretlenen doğru/yanlış, doğru şık her zaman görünür */
function getReviewChoiceClasses(
  choiceLetter: string,
  userAnswer: string | undefined,
  correctChoice: string | null | undefined,
): string {
  const correct = correctChoice ?? "";
  const isUserPick = userAnswer === choiceLetter;
  const isCorrectLetter = !!correct && choiceLetter === correct;
  if (isUserPick && isCorrectLetter) {
    return "bg-emerald-500 border-emerald-600 text-white shadow-md scale-110";
  }
  if (isUserPick && !isCorrectLetter) {
    return "bg-red-500 border-red-600 text-white shadow-md scale-110";
  }
  if (isCorrectLetter && !isUserPick) {
    return "bg-emerald-500/15 border-emerald-500/55 text-emerald-800 dark:text-emerald-200";
  }
  return "bg-muted/40 border-border/50 text-muted-foreground opacity-70";
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function groupByLesson(questions: Question[]): LessonGroup[] {
  const map = new Map<string, LessonGroup>();
  questions.forEach((q, index) => {
    if (!map.has(q.lesson))
      map.set(q.lesson, { lesson: q.lesson, questions: [] });
    map.get(q.lesson)!.questions.push({ q, index });
  });
  return Array.from(map.values());
}

function renderInlineStroke(ctx: CanvasRenderingContext2D, stroke: InlineStroke) {
  if (stroke.points.length === 0) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation =
    stroke.tool === "eraser" ? "destination-out" : "source-over";
  ctx.strokeStyle = stroke.color;

  if (stroke.points.length === 1) {
    ctx.beginPath();
    ctx.arc(stroke.points[0].x, stroke.points[0].y, Math.max(1, stroke.width / 2), 0, Math.PI * 2);
    ctx.fillStyle = stroke.color;
    ctx.fill();
    ctx.restore();
    return;
  }

  // Use quadraticCurveTo for smooth curves like in DrawingCanvas
  for (let i = 0; i < stroke.points.length - 1; i++) {
    const p0 = stroke.points[i];
    const p1 = stroke.points[i + 1];

    ctx.beginPath();
    ctx.lineWidth = stroke.width;
    ctx.strokeStyle = stroke.color;

    if (i === 0) {
      ctx.moveTo(p0.x, p0.y);
    } else {
      ctx.moveTo((stroke.points[i - 1].x + p0.x) / 2, (stroke.points[i - 1].y + p0.y) / 2);
    }
    ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
    ctx.stroke();
  }
  ctx.restore();
}

function redrawInlineCanvas(
  ctx: CanvasRenderingContext2D,
  strokes: InlineStroke[],
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);
  for (const stroke of strokes) renderInlineStroke(ctx, stroke);
}

function eraseInlineStrokesByPath(
  strokes: InlineStroke[],
  eraserPath: CanvasPoint[],
  radius: number,
) {
  if (!eraserPath.length || radius <= 0) return strokes;
  return strokes.filter((stroke) => {
    if (stroke.tool === "eraser") return true;
    for (const p of stroke.points) {
      for (const e of eraserPath) {
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        if (dx * dx + dy * dy <= radius * radius) return false;
      }
    }
    return true;
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TestMode() {
  const [, params] = useRoute("/tests/:id");
  const [, setLocation] = useLocation();
  const testId = params?.id ? parseInt(params.id) : 0;

  const { data: test, isLoading } = useGetTest(testId);
  const statusMutation = useUpdateTestQuestionStatus();
  const updateTestMutation = useUpdateTest();
  const queryClient = useQueryClient();
  const sessionCompleted = !!(test as { completedAt?: string | null } | undefined)?.completedAt;

  const questions: Question[] = (test?.questions as any) ?? [];

  // ── State ──
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showCanvas, setShowCanvas] = useState(false);
  // Selected answers: questionId → choice letter
  const [answers, setAnswers] = useState<Record<number, string>>({});
  // Manual status overrides after result
  const [manualStatuses, setManualStatuses] = useState<Record<number, QStatus>>({});
  const [finished, setFinished] = useState(false);
  /** Bitirdikten sonra veya tamamlanmış teste girince: özet kartları vs. soru soru kontrol */
  const [reviewViewMode, setReviewViewMode] = useState<"summary" | "kontrol">("summary");
  const [showSolutionDialog, setShowSolutionDialog] = useState(false);
  const [collapsedLessons, setCollapsedLessons] = useState<Record<string, boolean>>({});
  // Temporary drawings (not saved to DB): questionId → canvasData JSON string
  const [tempDrawings, setTempDrawings] = useState<Record<number, string>>({});
  const [inlineDrawEnabled, setInlineDrawEnabled] = useState(false);
  const [inlineTool, setInlineTool] = useState<"pen" | "eraser">("pen");
  const [inlineEraserMode, setInlineEraserMode] = useState<InlineEraserMode>("area");
  const [inlinePenWidth, setInlinePenWidth] = useState(3);
  const [inlineEraserWidth, setInlineEraserWidth] = useState(16);
  const [inlineColor, setInlineColor] = useState("#111111");
  const [isInlineDrawing, setIsInlineDrawing] = useState(false);
  const [inlineDrawingsByQuestion, setInlineDrawingsByQuestion] = useState<Record<number, InlineStroke[]>>({});
  const [inlineCursorPos, setInlineCursorPos] = useState<CanvasPoint | null>(null);
  const [inlineCursorInCanvas, setInlineCursorInCanvas] = useState(false);
  const inlineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const inlineImageWrapRef = useRef<HTMLDivElement | null>(null);
  const inlineLastPointRef = useRef<CanvasPoint | null>(null);
  const inlineCurrentStrokeRef = useRef<InlineStroke | null>(null);

  // ── Timer ──
  const timeLimitSeconds: number | null = (test as any)?.timeLimitSeconds ?? null;
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishRef = useRef(false);
  const draftHydratedRef = useRef(false);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showExitDialog, setShowExitDialog] = useState(false);
  /** Taslak okunana kadar kaydetme — boş state ile üzerine yazmayı önler */
  const [draftReady, setDraftReady] = useState(false);

  useEffect(() => {
    draftHydratedRef.current = false;
    finishRef.current = false;
    setDraftReady(false);
    setFinished(false);
    setReviewViewMode("summary");
  }, [testId]);

  const handleFinish = useCallback(
    async (_forced = false) => {
      if (finishRef.current) return;
      finishRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
      try {
        localStorage.removeItem(testDraftKey(testId));
      } catch {
        /* */
      }

      const snapshotStatuses: Record<number, QStatus> = {};
      for (const q of questions) {
        const userAnswer = answers[q.id];
        let status: QStatus;
        if (!userAnswer) {
          status = "Cozulmedi";
        } else if (q.choice && userAnswer === q.choice) {
          status = "DogruCozuldu";
        } else {
          status = "YanlisHocayaSor";
        }
        snapshotStatuses[q.id] = status;
      }

      await Promise.all(
        questions.map(async (q) => {
          const userAnswer = answers[q.id];
          const status = snapshotStatuses[q.id];
          if (userAnswer || q.status !== "Cozulmedi") {
            await statusMutation.mutateAsync({
              id: testId,
              questionId: q.id,
              data: { status },
            });
          }
        })
      );

      try {
        await updateTestMutation.mutateAsync({
          id: testId,
          data: { completedAt: new Date().toISOString() },
        });
      } catch {
        /* Sunucu hatası — yine de yerel gözden geçirme kaydı tutulur */
      }

      const snapshot: TestReviewSnapshotV1 = {
        version: 1,
        answers: { ...answers },
        manualStatuses: snapshotStatuses as Record<number, string>,
        currentIndex,
        tempDrawings: { ...tempDrawings },
        inlineDrawingsByQuestion: { ...inlineDrawingsByQuestion } as Record<number, unknown>,
        elapsed,
        collapsedLessons: { ...collapsedLessons },
        inlineDrawEnabled: false,
      };
      try {
        localStorage.setItem(testReviewKey(testId), JSON.stringify(snapshot));
      } catch {
        /* quota */
      }

      setManualStatuses(snapshotStatuses);
      setInlineDrawEnabled(false);
      setReviewViewMode("summary");

      await queryClient.invalidateQueries({ queryKey: getListQuestionsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getListTestsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetTestQueryKey(testId) });
      setFinished(true);
    },
    [
      answers,
      testId,
      statusMutation,
      updateTestMutation,
      queryClient,
      questions,
      currentIndex,
      tempDrawings,
      inlineDrawingsByQuestion,
      elapsed,
      collapsedLessons,
    ]
  );

  useEffect(() => {
    if (!test) return;
    if (sessionCompleted) return;
    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (timeLimitSeconds && next >= timeLimitSeconds && !finishRef.current) {
          handleFinish(true);
        }
        return next;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [test?.id, sessionCompleted, timeLimitSeconds, handleFinish]);

  // Taslak veya tamamlanmış test gözden geçirme yükleme
  useEffect(() => {
    if (!test?.id || questions.length === 0 || draftHydratedRef.current) return;
    draftHydratedRef.current = true;

    if (sessionCompleted) {
      try {
        const raw = localStorage.getItem(testReviewKey(testId));
        if (raw) {
          const r = JSON.parse(raw) as TestReviewSnapshotV1;
          if (r.version === 1) {
            setAnswers((r.answers ?? {}) as Record<number, string>);
            setManualStatuses((r.manualStatuses ?? {}) as Record<number, QStatus>);
            setCurrentIndex(Math.min(Math.max(0, r.currentIndex ?? 0), questions.length - 1));
            setTempDrawings((r.tempDrawings ?? {}) as Record<number, string>);
            setInlineDrawingsByQuestion(
              (r.inlineDrawingsByQuestion ?? {}) as Record<number, InlineStroke[]>
            );
            setElapsed(Math.max(0, r.elapsed ?? 0));
            if (r.collapsedLessons) setCollapsedLessons(r.collapsedLessons);
            setInlineDrawEnabled(false);
          }
        }
      } catch {
        /* ignore */
      }
      setFinished(true);
      setReviewViewMode("summary");
      setDraftReady(true);
      return;
    }

    try {
      const raw = localStorage.getItem(testDraftKey(testId));
      if (raw) {
        const d = JSON.parse(raw) as TestDraftV1;
        if (d.version === 1) {
          setAnswers(d.answers ?? {});
          setCurrentIndex(Math.min(Math.max(0, d.currentIndex ?? 0), questions.length - 1));
          setTempDrawings(d.tempDrawings ?? {});
          setInlineDrawingsByQuestion(d.inlineDrawingsByQuestion ?? {});
          setElapsed(Math.max(0, d.elapsed ?? 0));
          if (d.collapsedLessons) setCollapsedLessons(d.collapsedLessons);
          setInlineDrawEnabled(!!d.inlineDrawEnabled);
        }
      }
    } catch {
      /* ignore */
    }
    setDraftReady(true);
  }, [test?.id, testId, questions.length, sessionCompleted]);

  // Taslak kaydet (test bitene kadar; tamamlanmış testte taslak yok)
  useEffect(() => {
    if (!testId || finished || !draftReady || sessionCompleted) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const draft: TestDraftV1 = {
        version: 1,
        answers,
        currentIndex,
        tempDrawings,
        inlineDrawingsByQuestion,
        elapsed,
        collapsedLessons,
        inlineDrawEnabled,
      };
      try {
        localStorage.setItem(testDraftKey(testId), JSON.stringify(draft));
      } catch {
        /* quota */
      }
    }, 450);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [
    testId,
    finished,
    draftReady,
    answers,
    currentIndex,
    tempDrawings,
    inlineDrawingsByQuestion,
    elapsed,
    collapsedLessons,
    inlineDrawEnabled,
    sessionCompleted,
  ]);

  // Gözden geçirme (kontrol) sırasında indeks / çizimleri yerelde güncelle
  useEffect(() => {
    if (!testId || !finished || reviewViewMode !== "kontrol" || !draftReady) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const snap: TestReviewSnapshotV1 = {
        version: 1,
        answers: { ...answers },
        manualStatuses: manualStatuses as Record<number, string>,
        currentIndex,
        tempDrawings: { ...tempDrawings },
        inlineDrawingsByQuestion: { ...inlineDrawingsByQuestion } as Record<number, unknown>,
        elapsed,
        collapsedLessons: { ...collapsedLessons },
        inlineDrawEnabled: false,
      };
      try {
        localStorage.setItem(testReviewKey(testId), JSON.stringify(snap));
      } catch {
        /* */
      }
    }, 400);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [
    testId,
    finished,
    reviewViewMode,
    draftReady,
    answers,
    manualStatuses,
    currentIndex,
    tempDrawings,
    inlineDrawingsByQuestion,
    elapsed,
    collapsedLessons,
  ]);

  // ── Derived ──
  const groups = groupByLesson(questions);
  const currentQuestion = questions[currentIndex];
  const readOnly = finished && reviewViewMode === "kontrol";

  useEffect(() => {
    const wrap = inlineImageWrapRef.current;
    const canvas = inlineCanvasRef.current;
    if (!wrap || !canvas || !currentQuestion?.imageUrl) return;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const strokes = inlineDrawingsByQuestion[currentQuestion.id] ?? [];
      redrawInlineCanvas(ctx, strokes, canvas.width, canvas.height);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [currentQuestion?.id, currentQuestion?.imageUrl, inlineDrawingsByQuestion, inlineDrawEnabled, readOnly]);

  const getInlinePoint = (e: React.PointerEvent<HTMLCanvasElement>): CanvasPoint => {
    const canvas = inlineCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const drawInlineSegment = (from: CanvasPoint, to: CanvasPoint, stroke: InlineStroke) => {
    const canvas = inlineCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderInlineStroke(ctx, { ...stroke, points: [from, to] });
  };

  const selectAnswer = (questionId: number, choice: string) => {
    if (readOnly) return;
    setAnswers((prev) => {
      if (prev[questionId] === choice) {
        const next = { ...prev };
        delete next[questionId];
        return next;
      }
      return { ...prev, [questionId]: choice };
    });
  };

  const toggleCollapse = (lesson: string) => {
    setCollapsedLessons((p) => ({ ...p, [lesson]: !p[lesson] }));
  };

  // Satır içi kalem imleci: canvas üzerinde pointerleave titremesi yerine global pointermove + rect toleransı
  useEffect(() => {
    if (!inlineDrawEnabled || readOnly) return;
    const EDGE_PAD = 8;
    const sync = (e: PointerEvent) => {
      const canvas = inlineCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const inBounds =
        e.clientX >= rect.left - EDGE_PAD &&
        e.clientX <= rect.right + EDGE_PAD &&
        e.clientY >= rect.top - EDGE_PAD &&
        e.clientY <= rect.bottom + EDGE_PAD;
      if (!inBounds) {
        setInlineCursorInCanvas(false);
        setInlineCursorPos(null);
        return;
      }
      setInlineCursorInCanvas(true);
      setInlineCursorPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };
    window.addEventListener("pointermove", sync, { passive: true });
    return () => window.removeEventListener("pointermove", sync);
  }, [inlineDrawEnabled, readOnly, currentQuestion?.id]);

  const remaining = timeLimitSeconds !== null ? timeLimitSeconds - elapsed : null;
  const timerLabel =
    remaining !== null ? formatTime(Math.max(0, remaining)) : formatTime(elapsed);
  const timerIsWarning = remaining !== null && remaining <= 60;

  // ── Loading / Empty ──
  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <div className="animate-spin h-10 w-10 border-b-2 border-primary rounded-full" />
      </div>
    );
  }
  if (!test || questions.length === 0) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-2xl font-bold font-display mb-4">
          Test Bulunamadı veya Boş
        </h2>
        <Button
          onClick={() => setLocation("/tests")}
          variant="outline"
          className="rounded-xl"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Geri Dön
        </Button>
      </div>
    );
  }

  // ── Sonuç özeti (bitiş veya tamamlanmış teste giriş) ──
  if (finished && reviewViewMode === "summary") {
    const correct = questions.filter(
      (q) => (manualStatuses[q.id] ?? q.status) === "DogruCozuldu"
    ).length;
    const wrong = questions.filter(
      (q) => (manualStatuses[q.id] ?? q.status) === "YanlisHocayaSor"
    ).length;
    const skipped = questions.length - correct - wrong;

    return (
      <div className="h-screen bg-background flex flex-col">
        <header className="h-16 flex items-center justify-between px-6 border-b border-border/50 bg-card/80 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/tests")}
              className="rounded-xl h-9 w-9"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="font-display font-bold text-lg">
              {test.name} — Sonuçlar
            </h1>
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Clock className="w-4 h-4" /> {formatTime(elapsed)}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-5 text-center">
              <div className="text-3xl font-bold text-green-500">{correct}</div>
              <div className="text-sm text-green-400 mt-1 font-medium">Doğru</div>
            </div>
            <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-5 text-center">
              <div className="text-3xl font-bold text-destructive">{wrong}</div>
              <div className="text-sm text-destructive/80 mt-1 font-medium">Yanlış</div>
            </div>
            <div className="bg-muted/30 border border-border/50 rounded-2xl p-5 text-center">
              <div className="text-3xl font-bold text-muted-foreground">{skipped}</div>
              <div className="text-sm text-muted-foreground mt-1 font-medium">Boş</div>
            </div>
            <div className="bg-primary/10 border border-primary/30 rounded-2xl p-5 text-center">
              <div className="text-3xl font-bold text-primary font-mono">{formatTime(elapsed)}</div>
              <div className="text-sm text-primary/70 mt-1 font-medium">Süre</div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <Button
              className="rounded-xl gap-2 font-semibold"
              onClick={() => setReviewViewMode("kontrol")}
            >
              <ClipboardCheck className="w-4 h-4" /> Soruları kontrol et
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={() => setLocation("/tests")}>
              Test merkezine dön
            </Button>
          </div>

          <h2 className="text-lg font-display font-semibold mb-4">Özet</h2>

          {groups.map((group) => (
            <div key={group.lesson} className="mb-4">
              <h3 className="text-sm font-semibold text-primary/80 uppercase tracking-wider mb-2">
                {group.lesson}
              </h3>
              <div className="space-y-2">
                {group.questions.map(({ q, index }) => {
                  const status: QStatus = (manualStatuses[q.id] ?? q.status) as QStatus;
                  const userAnswer = answers[q.id];
                  return (
                    <div
                      key={q.id}
                      className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40"
                    >
                      <span className="text-sm font-bold text-muted-foreground w-6 shrink-0">
                        #{index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground">
                          {q.topic || q.lesson}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          {userAnswer && (
                            <span>
                              Senin şıkkın:{" "}
                              <strong className="text-foreground">{userAnswer}</strong>
                            </span>
                          )}
                          {q.choice && (
                            <span>
                              · Doğru şık:{" "}
                              <strong className="text-primary">{q.choice}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                      <div
                        className={cn(
                          "p-1.5 rounded-lg shrink-0",
                          status === "DogruCozuldu"
                            ? "text-green-500"
                            : status === "YanlisHocayaSor"
                              ? "text-destructive"
                              : "text-muted-foreground"
                        )}
                        title="Sonuç"
                      >
                        {status === "DogruCozuldu" ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : status === "YanlisHocayaSor" ? (
                          <XCircle className="w-5 h-5" />
                        ) : (
                          <Clock className="w-5 h-5" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Test Screen (çözüm veya gözden geçirme / kontrol) ──
  const answeredCount = Object.keys(answers).length;
  const solutionEmbed = getYoutubeEmbedSrc(currentQuestion?.solutionUrl);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top bar */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-border/50 bg-card/80 backdrop-blur-xl shrink-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => (readOnly ? setReviewViewMode("summary") : setShowExitDialog(true))}
            className="rounded-xl h-9 w-9 shrink-0"
            title={readOnly ? "Sonuçlara dön" : "Çık"}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="font-display font-bold text-base leading-tight truncate">
              {test.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              {readOnly
                ? `Gözden geçirme · Soru ${currentIndex + 1}/${questions.length}`
                : `${answeredCount}/${questions.length} işaretlendi`}
            </p>
          </div>
        </div>

        <div
          className={cn(
            "flex items-center gap-2 px-4 py-1.5 rounded-xl font-mono font-bold text-sm border",
            timeLimitSeconds
              ? timerIsWarning
                ? "bg-destructive/10 border-destructive/40 text-destructive"
                : "bg-primary/10 border-primary/30 text-primary"
              : "bg-muted/30 border-border/40 text-foreground"
          )}
        >
          {timeLimitSeconds ? (
            <Timer className="w-4 h-4" />
          ) : (
            <Clock className="w-4 h-4" />
          )}
          {timerLabel}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {currentQuestion.imageUrl && !readOnly && (
            <div className="hidden sm:flex items-center gap-1 rounded-xl border border-border/50 bg-background/70 px-2 py-1">
              <Button
                variant={inlineDrawEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => setInlineDrawEnabled((v) => !v)}
                className="rounded-lg h-8 px-2 gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" /> Kalem
              </Button>
              <Button
                variant={inlineTool === "pen" ? "default" : "ghost"}
                size="icon"
                onClick={() => setInlineTool("pen")}
                disabled={!inlineDrawEnabled}
                className="h-7 w-7 rounded-lg"
                title="Kalem"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={inlineTool === "eraser" ? "default" : "ghost"}
                size="icon"
                onClick={() => setInlineTool("eraser")}
                disabled={!inlineDrawEnabled}
                className="h-7 w-7 rounded-lg"
                title="Silgi"
              >
                <Eraser className="w-3.5 h-3.5" />
              </Button>
              {inlineTool === "pen" && (
                <div className="flex items-center gap-1 px-1">
                  {["#111111", "#dc2626", "#2563eb", "#16a34a"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      disabled={!inlineDrawEnabled}
                      onClick={() => setInlineColor(c)}
                      className={cn(
                        "h-6 w-6 rounded-full border disabled:opacity-40",
                        inlineColor === c ? "border-white" : "border-border/50",
                      )}
                      style={{ backgroundColor: c }}
                      title="Renk"
                    />
                  ))}
                </div>
              )}
              {inlineTool === "eraser" && (
                <>
                  <Button
                    variant={inlineEraserMode === "area" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setInlineEraserMode("area")}
                    disabled={!inlineDrawEnabled}
                    className="h-7 px-2 rounded-lg text-[10px]"
                  >
                    Alan
                  </Button>
                  <Button
                    variant={inlineEraserMode === "stroke" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setInlineEraserMode("stroke")}
                    disabled={!inlineDrawEnabled}
                    className="h-7 px-2 rounded-lg text-[10px]"
                  >
                    Cizgi
                  </Button>
                </>
              )}
              <input
                type="range"
                min={2}
                max={inlineTool === "eraser" ? 40 : 8}
                step={1}
                value={inlineTool === "eraser" ? inlineEraserWidth : inlinePenWidth}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (inlineTool === "eraser") setInlineEraserWidth(value);
                  else setInlinePenWidth(value);
                }}
                disabled={!inlineDrawEnabled}
                className="w-16"
              />
              <Button
                variant="ghost"
                size="icon"
                disabled={!inlineDrawEnabled}
                className="h-7 w-7 rounded-lg"
                title="Bu sorunun çizimini temizle"
                onClick={() => {
                  const canvas = inlineCanvasRef.current;
                  if (!canvas || !currentQuestion) return;
                  const ctx = canvas.getContext("2d");
                  if (!ctx) return;
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  setInlineDrawingsByQuestion((prev) => {
                    const next = { ...prev };
                    delete next[currentQuestion.id];
                    return next;
                  });
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
          {!readOnly && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCanvas(true)}
                className="rounded-xl gap-2 hidden sm:flex"
              >
                <Paintbrush className="w-4 h-4" /> Çözüm Tahtası
              </Button>
              <Button
                size="sm"
                onClick={() => handleFinish()}
                className="rounded-xl gap-1.5 font-semibold"
              >
                Testi Bitir
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Question area */}
        <main className="flex-1 overflow-y-auto p-4 flex flex-col items-center">
          <div className="w-full max-w-3xl">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="secondary">{currentQuestion.lesson}</Badge>
              {currentQuestion.topic && (
                <Badge variant="outline">{currentQuestion.topic}</Badge>
              )}
              <Badge
                variant="outline"
                className="text-primary border-primary/30"
              >
                {currentQuestion.category}
              </Badge>
              {readOnly && (
                <button
                  type="button"
                  onClick={() => setShowSolutionDialog(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/30"
                >
                  <Video className="w-3.5 h-3.5 shrink-0" />
                  Çözüm videosu
                </button>
              )}
              <span className="ml-auto text-sm text-muted-foreground font-medium">
                Soru {currentIndex + 1} / {questions.length}
              </span>
            </div>

            <div className="bg-card rounded-2xl border border-border/50 overflow-hidden shadow-lg mb-4">
              {currentQuestion.imageUrl ? (
                <div
                  ref={inlineImageWrapRef}
                  className="relative flex items-center justify-center p-4 bg-white/5 min-h-[280px]"
                  style={{
                    cursor:
                      readOnly || !inlineDrawEnabled
                        ? "auto"
                        : inlineTool === "pen"
                          ? "none"
                          : "auto",
                  }}
                >
                  <img
                    src={currentQuestion.imageUrl}
                    alt="Soru"
                    className="max-w-full object-contain rounded"
                    style={{ maxHeight: "48vh" }}
                  />
                  {(inlineDrawEnabled || readOnly) && (
                    <canvas
                      ref={inlineCanvasRef}
                      className={cn("absolute inset-0 touch-none", readOnly && "pointer-events-none")}
                      style={{ touchAction: "none" }}
                      onPointerDown={(e) => {
                        if (readOnly || !inlineDrawEnabled) return;
                        e.preventDefault();
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        setIsInlineDrawing(true);

                        const isHardwareEraser = e.button === 5 || (e.buttons & 32) === 32;
                        if (e.pointerType === "pen") {
                          if (isHardwareEraser) setInlineTool("eraser");
                          else setInlineTool("pen");
                        } else if (isHardwareEraser) {
                          setInlineTool("eraser");
                        }
                        const activeTool: "pen" | "eraser" = isHardwareEraser
                          ? "eraser"
                          : e.pointerType === "pen"
                            ? "pen"
                            : inlineTool;

                        const start = getInlinePoint(e);
                        inlineLastPointRef.current = start;
                        inlineCurrentStrokeRef.current = {
                          tool: activeTool,
                          color: activeTool === "eraser" ? "#000000" : inlineColor,
                          width: activeTool === "eraser" ? inlineEraserWidth : inlinePenWidth,
                          points: [start],
                        };
                      }}
                      onPointerMove={(e) => {
                        if (readOnly) return;
                        const point = getInlinePoint(e);
                        const isHardwareEraser = e.button === 5 || (e.buttons & 32) === 32;
                        if (e.pointerType === "pen") {
                          if (isHardwareEraser) setInlineTool("eraser");
                          else setInlineTool("pen");
                        } else if (isHardwareEraser) {
                          setInlineTool("eraser");
                        }
                        
                        if (!isInlineDrawing) return;
                        e.preventDefault();
                        const next = point;
                        const last = inlineLastPointRef.current;
                        const currentStroke = inlineCurrentStrokeRef.current;
                        if (!last) {
                          inlineLastPointRef.current = next;
                          return;
                        }
                        if (!currentStroke) return;
                        
                        // Check distance to avoid too many points
                        if (Math.hypot(next.x - last.x, next.y - last.y) < 1) return;
                        
                        currentStroke.points.push(next);
                        const isAreaEraser =
                          currentStroke.tool === "eraser" && inlineEraserMode === "area";
                        if (currentStroke.tool === "pen" || isAreaEraser) {
                          // Redraw entire canvas with all strokes + current stroke
                          const canvas = inlineCanvasRef.current;
                          if (canvas) {
                            const ctx = canvas.getContext("2d");
                            if (ctx) {
                              ctx.clearRect(0, 0, canvas.width, canvas.height);
                              
                              // Redraw all existing strokes
                              const existingStrokes = inlineDrawingsByQuestion[currentQuestion.id] ?? [];
                              redrawInlineCanvas(ctx, existingStrokes, canvas.width, canvas.height);
                              
                              // Draw entire current stroke (not just last segment)
                              renderInlineStroke(ctx, currentStroke);
                            }
                          }
                        }
                        inlineLastPointRef.current = next;
                      }}
                      onPointerUp={(e) => {
                        if (readOnly) return;
                        if (!isInlineDrawing) return;
                        e.preventDefault();
                        const currentStroke = inlineCurrentStrokeRef.current;
                        if (currentStroke && currentQuestion) {
                          setInlineDrawingsByQuestion((prev) => {
                            const prevStrokes = prev[currentQuestion.id] ?? [];
                            const nextStrokes =
                              currentStroke.tool === "eraser" && inlineEraserMode === "stroke"
                                ? eraseInlineStrokesByPath(prevStrokes, currentStroke.points, Math.max(6, currentStroke.width / 2))
                                : [...prevStrokes, currentStroke];
                            return { ...prev, [currentQuestion.id]: nextStrokes };
                          });
                        }
                        setIsInlineDrawing(false);
                        inlineLastPointRef.current = null;
                        inlineCurrentStrokeRef.current = null;
                      }}
                      onPointerCancel={() => {
                        setIsInlineDrawing(false);
                        inlineLastPointRef.current = null;
                        inlineCurrentStrokeRef.current = null;
                      }}
                    />
                  )}
                  {inlineDrawEnabled &&
                    inlineTool === "pen" &&
                    inlineCursorInCanvas &&
                    inlineCursorPos &&
                    !isInlineDrawing && (
                    <div
                      className="pointer-events-none absolute z-20 rounded-full"
                      style={{
                        left: inlineCursorPos.x,
                        top: inlineCursorPos.y,
                        width: 8,
                        height: 8,
                        transform: "translate(-50%, -50%)",
                        backgroundColor: inlineColor,
                        boxShadow: "0 0 0 1px rgba(255,255,255,0.5), 0 0 0 2px rgba(0,0,0,0.3)",
                      }}
                    />
                  )}
                  {inlineDrawEnabled &&
                    inlineTool === "eraser" &&
                    inlineCursorInCanvas &&
                    inlineCursorPos &&
                    !isInlineDrawing && (
                    <div
                      className="pointer-events-none absolute z-20 rounded-full border-[2.5px] border-orange-400 bg-orange-400/15"
                      style={{
                        left: inlineCursorPos.x,
                        top: inlineCursorPos.y,
                        width: Math.max(10, Math.min(inlineEraserWidth, 120)),
                        height: Math.max(10, Math.min(inlineEraserWidth, 120)),
                        transform: "translate(-50%, -50%)",
                        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.35)",
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center min-h-[200px] text-muted-foreground font-display">
                  Görsel Yok
                </div>
              )}
              {currentQuestion.description && (
                <div className="px-5 py-3 border-t border-border/40 text-sm text-muted-foreground italic">
                  {currentQuestion.description}
                </div>
              )}
            </div>

            {/* Choice bubbles */}
            <div className="flex items-center justify-center gap-3 mb-4 flex-wrap">
              {CHOICES.map((c) => {
                const selected = answers[currentQuestion.id] === c;
                return (
                  <button
                    key={c}
                    type="button"
                    disabled={readOnly}
                    onClick={() => selectAnswer(currentQuestion.id, c)}
                    className={cn(
                      "w-12 h-12 rounded-full font-bold text-lg border-2 transition-all duration-150",
                      readOnly
                        ? getReviewChoiceClasses(c, answers[currentQuestion.id], currentQuestion.choice)
                        : selected
                          ? "bg-primary border-primary text-primary-foreground shadow-lg scale-110"
                          : "bg-background border-border/60 text-foreground hover:border-primary/60 hover:scale-105"
                    )}
                  >
                    {c}
                  </button>
                );
              })}
            </div>

            {/* Navigation */}
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => setCurrentIndex((p) => Math.max(0, p - 1))}
                disabled={currentIndex === 0}
                className="rounded-xl"
              >
                ← Önceki
              </Button>
              {!readOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCanvas(true)}
                  className="rounded-xl gap-2 sm:hidden"
                >
                  <Paintbrush className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() =>
                  setCurrentIndex((p) => Math.min(questions.length - 1, p + 1))
                }
                disabled={currentIndex === questions.length - 1}
                className="rounded-xl"
              >
                Sonraki →
              </Button>
            </div>
          </div>
        </main>

        {/* Answer panel */}
        <aside className="w-64 shrink-0 border-l border-border/50 bg-card/40 backdrop-blur overflow-y-auto hidden md:flex flex-col">
          <div className="p-3 border-b border-border/40 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cevap Kâğıdı
            </span>
            <span className="text-xs text-primary font-bold">
              {answeredCount}/{questions.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {groups.map((group) => (
              <div key={group.lesson}>
                <button
                  onClick={() => toggleCollapse(group.lesson)}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-muted/40 transition-colors"
                >
                  <span className="text-xs font-bold text-primary/80 uppercase tracking-wide">
                    {group.lesson}
                  </span>
                  {collapsedLessons[group.lesson] ? (
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  )}
                </button>

                {!collapsedLessons[group.lesson] && (
                  <div className="ml-1 space-y-0.5">
                    {group.questions.map(({ q, index }) => {
                      const isCurrent = index === currentIndex;
                      const userAnswer = answers[q.id];
                      return (
                        <button
                          key={q.id}
                          onClick={() => setCurrentIndex(index)}
                          className={cn(
                            "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all text-left",
                            isCurrent
                              ? "bg-primary/15 ring-1 ring-primary/30"
                              : "hover:bg-muted/30"
                          )}
                        >
                          <span
                            className={cn(
                              "text-xs font-bold w-5 shrink-0",
                              isCurrent
                                ? "text-primary"
                                : "text-muted-foreground"
                            )}
                          >
                            {index + 1}
                          </span>
                          <div className="flex gap-0.5">
                            {CHOICES.map((c) => {
                              const sel = userAnswer === c;
                              return (
                                <span
                                  key={c}
                                  role={readOnly ? undefined : "button"}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentIndex(index);
                                    if (!readOnly) selectAnswer(q.id, c);
                                  }}
                                  className={cn(
                                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all",
                                    readOnly
                                      ? getReviewChoiceClasses(c, userAnswer, q.choice)
                                      : cn(
                                          "cursor-pointer",
                                          sel
                                            ? "bg-primary border-primary text-primary-foreground"
                                            : "border-border/50 text-muted-foreground hover:border-primary/50"
                                        )
                                  )}
                                >
                                  {c}
                                </span>
                              );
                            })}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {!readOnly && (
            <div className="p-3 border-t border-border/40">
              <Button
                onClick={() => handleFinish()}
                className="w-full rounded-xl text-sm font-semibold gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Testi Bitir
              </Button>
            </div>
          )}
        </aside>
      </div>

      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent className="rounded-2xl border-border/60">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Testten çık</AlertDialogTitle>
            <AlertDialogDescription className="text-left text-muted-foreground leading-relaxed">
              <strong className="text-foreground font-medium">Sonra devam et</strong> dersen işaretlediğin şıklar ve çizimler bu cihazda test bitene kadar saklanır.
              <br />
              <strong className="text-foreground font-medium">Testi bitir</strong> dersen sonuçlar kaydedilir ve test tamamlanmış sayılır (üstteki “Testi Bitir” ile aynı).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel
              className="rounded-xl mt-0 w-full sm:w-auto border-border/60"
              onClick={() => setLocation("/tests")}
            >
              Sonra devam et
            </AlertDialogCancel>
            <Button
              className="rounded-xl w-full sm:w-auto gap-2"
              onClick={async () => {
                setShowExitDialog(false);
                await handleFinish();
              }}
            >
              Testi bitir
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showSolutionDialog} onOpenChange={setShowSolutionDialog}>
        <DialogContent className="rounded-2xl border-border/60 max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display">Çözüm videosu</DialogTitle>
          </DialogHeader>
          {solutionEmbed ? (
            <div className="aspect-video w-full rounded-xl overflow-hidden bg-black border border-border/40">
              <iframe
                src={solutionEmbed}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                title="Çözüm videosu"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {currentQuestion?.solutionUrl?.trim()
                ? "Bu adres YouTube olarak tanınmadı. Linki yeni sekmede açmayı deneyin."
                : "Bu soru için havuzda çözüm videosu linki eklenmemiş."}
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Drawing canvas modal — TEMPORARY, not saved to DB ── */}
      {showCanvas && !readOnly && (
        <div className="fixed inset-0 z-50 bg-black/95">
          <DrawingCanvas
            questionId={currentQuestion.id}
            imageUrl={currentQuestion.imageUrl}
            initialData={tempDrawings[currentQuestion.id]}
            noSave={true}
            onTempSave={(data) => {
              setTempDrawings((prev) => ({
                ...prev,
                [currentQuestion.id]: data,
              }));
            }}
            onClose={() => setShowCanvas(false)}
          />
        </div>
      )}
    </div>
  );
}

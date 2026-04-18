import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { MathLiveStatic } from "@/components/math/MathLiveStatic";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  testDraftKey,
  testReviewKey,
  type TestReviewSnapshotV1,
} from "@/lib/testSessionStorage";
import {
  buildTestSolutionsInput,
  useTestSessionStorage,
} from "@/lib/testSessionDbStorage";
import {
  formatVideoTimestampRange,
  getYoutubeEmbedSrc,
} from "@/lib/youtubeEmbed";
import { curvePressure, renderDrawingStroke } from "@/lib/drawing-engine";

// Types
type QStatus = "Cozulmedi" | "DogruCozuldu" | "YanlisHocayaSor";
interface Question {
  id: number;
  lesson: string;
  topic?: string | null;
  category: string;
  choice?: string | null;
  options?: Array<{ label: string; text: string }> | string | null;
  imageUrl?: string | null;
  status: string;
  description?: string | null;
  solutionUrl?: string | null;
  solutionYoutubeUrl?: string | null;
  solutionYoutubeStartSecond?: number | null;
  solutionYoutubeEndSecond?: number | null;
}
interface LessonGroup {
  lesson: string;
  questions: { q: Question; index: number }[];
}
interface CanvasPoint {
  x: number;
  y: number;
  pressure?: number;
}
interface InlineStroke {
  tool: "pen" | "eraser";
  color: string;
  width: number;
  points: CanvasPoint[];
  snapShape?: "line";
}
type InlineEraserMode = "area" | "stroke";

function getInlineCanvasDpr() {
  if (typeof window === "undefined") return 1;
  const device = window.devicePixelRatio || 1;
  const ua =
    typeof navigator !== "undefined" ? (navigator.userAgent ?? "") : "";
  const isApple = /Mac|iPhone|iPad|iPod/i.test(ua);
  return Math.min(device, isApple ? 2 : 2);
}

function curveInlinePressure(raw: number): number {
  return curvePressure(raw);
}

function prepareInlineCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const dpr = getInlineCanvasDpr();
  const targetWidth = Math.round(rect.width * dpr);
  const targetHeight = Math.round(rect.height * dpr);
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { ctx, width: rect.width, height: rect.height };
}

function renderInlineEraserTrail(
  ctx: CanvasRenderingContext2D,
  points: CanvasPoint[],
  width: number,
) {
  if (points.length < 2) return;
  const tail = points.slice(Math.max(0, points.length - 18));
  for (let i = 1; i < tail.length; i++) {
    const p0 = tail[i - 1];
    const p1 = tail[i];
    const progress = i / (tail.length - 1);
    const taper = 0.42 + progress * 0.92;

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = `rgba(98, 106, 120, ${0.18 + progress * 0.42})`;
    ctx.lineWidth = Math.max(2.5, width * taper);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = `rgba(71, 85, 105, ${0.16 + progress * 0.18})`;
    ctx.shadowBlur = 8 + progress * 6;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    ctx.restore();
  }
}

function renderInlineAreaEraserPreview(
  ctx: CanvasRenderingContext2D,
  points: CanvasPoint[],
  width: number,
) {
  if (points.length === 0) return;

  const radius = Math.max(8, width / 2);
  const preview = points.slice(Math.max(0, points.length - 8));

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < preview.length; i++) {
    const p = preview[i];
    const progress = (i + 1) / preview.length;
    ctx.beginPath();
    ctx.fillStyle = `rgba(59, 130, 246, ${0.08 + progress * 0.1})`;
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const last = preview[preview.length - 1];
  ctx.beginPath();
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.strokeStyle = "rgba(14, 165, 233, 0.9)";
  ctx.lineWidth = 2;
  ctx.arc(last.x, last.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

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

// Helpers
const CHOICES = ["A", "B", "C", "D", "E"] as const;

function getQuestionChoiceLabels(question: Question | undefined): string[] {
  const options = normalizeQuestionOptions(question?.options);
  if (!options || options.length === 0) return [...CHOICES];
  const labels = options
    .map((option) => (option.label || "").toUpperCase())
    .filter((label) => CHOICES.includes(label as (typeof CHOICES)[number]));
  return labels.length > 0 ? labels : [...CHOICES];
}

function getOptionText(
  question: Question | undefined,
  label: string,
): string | null {
  const options = normalizeQuestionOptions(question?.options);
  if (!options || options.length === 0) return null;
  const found = options.find(
    (option) => option.label?.toUpperCase() === label.toUpperCase(),
  );
  return found?.text?.trim() || null;
}

function normalizeQuestionOptions(
  raw: Question["options"],
): Array<{ label: string; text: string }> {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => ({
      label: String((item as any)?.label ?? "").toUpperCase(),
      text: String((item as any)?.text ?? ""),
    }))
    .filter((item) => item.label.length > 0 && item.text.trim().length > 0);
}

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function renderInlineStroke(
  ctx: CanvasRenderingContext2D,
  stroke: InlineStroke,
  cache = true,
) {
  renderDrawingStroke(ctx, stroke, { widthMode: "raw", cache });
}

function redrawInlineCanvas(
  ctx: CanvasRenderingContext2D,
  strokes: InlineStroke[],
  width: number,
  height: number,
  previewStroke?: InlineStroke | null,
  eraserMode: InlineEraserMode = "area",
) {
  ctx.clearRect(0, 0, width, height);
  for (const stroke of strokes) renderInlineStroke(ctx, stroke);
  if (previewStroke) {
    if (previewStroke.tool === "eraser" && eraserMode === "stroke") {
      renderInlineEraserTrail(ctx, previewStroke.points, previewStroke.width);
    }
    if (previewStroke.tool === "eraser" && eraserMode === "area") {
      renderInlineAreaEraserPreview(
        ctx,
        previewStroke.points,
        previewStroke.width,
      );
    }
    renderInlineStroke(ctx, previewStroke, false);
  }
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

// Main Component
export default function TestMode() {
  const [, params] = useRoute("/tests/:id");
  const [, setLocation] = useLocation();
  const testId = params?.id ? parseInt(params.id) : 0;
  const allowCompletedReview = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("review") === "1";
    } catch {
      return false;
    }
  }, []);

  const { data: test, isLoading } = useGetTest(testId);
  const statusMutation = useUpdateTestQuestionStatus();
  const updateTestMutation = useUpdateTest();
  const queryClient = useQueryClient();
  const sessionCompleted = !!(
    test as { completedAt?: string | null } | undefined
  )?.completedAt;

  // Database Storage for Sync
  const { storage } = useTestSessionStorage(testId);

  const questions: Question[] = (test?.questions as any) ?? [];

  // State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showCanvas, setShowCanvas] = useState(false);
  // Selected answers: questionId -> choice letter
  const [answers, setAnswers] = useState<Record<number, string>>({});
  // Manual status overrides after result
  const [manualStatuses, setManualStatuses] = useState<Record<number, QStatus>>(
    {},
  );
  const [finished, setFinished] = useState(false);
  /** Bitirdikten sonra veya tamamlanmış teste girince: özet kartları vs. soru soru kontrol */
  const [reviewViewMode, setReviewViewMode] = useState<"summary" | "kontrol">(
    "summary",
  );
  const [showSolutionDialog, setShowSolutionDialog] = useState(false);
  const [collapsedLessons, setCollapsedLessons] = useState<
    Record<string, boolean>
  >({});
  // Temporary drawings (not saved to DB): questionId -> canvasData JSON string
  const [tempDrawings, setTempDrawings] = useState<Record<number, string>>({});
  const [inlineDrawEnabled, setInlineDrawEnabled] = useState(false);
  const [inlineTool, setInlineTool] = useState<"pen" | "eraser">("pen");
  const inlineToolRef = useRef<"pen" | "eraser">("pen");
  inlineToolRef.current = inlineTool;
  const setInlineToolIfChanged = useCallback((nextTool: "pen" | "eraser") => {
    if (inlineToolRef.current === nextTool) return;
    inlineToolRef.current = nextTool;
    setInlineTool(nextTool);
  }, []);
  const [inlineEraserMode, setInlineEraserMode] =
    useState<InlineEraserMode>("stroke");
  const [inlinePenWidth, setInlinePenWidth] = useState(3);
  const [inlineEraserWidth, setInlineEraserWidth] = useState(16);
  const [inlineColor, setInlineColor] = useState("#111111");
  const [isInlineDrawing, setIsInlineDrawing] = useState(false);
  const isInlineDrawingRef = useRef(false);
  const [inlineDrawingsByQuestion, setInlineDrawingsByQuestion] = useState<
    Record<number, InlineStroke[]>
  >({});
  const [inlineCursorPos, setInlineCursorPos] = useState<CanvasPoint | null>(
    null,
  );
  const [inlineCursorInCanvas, setInlineCursorInCanvas] = useState(false);
  const inlineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const inlineImageRef = useRef<HTMLImageElement | null>(null);
  const inlineImageWrapRef = useRef<HTMLDivElement | null>(null);
  const inlineCanvasHostRef = useRef<HTMLDivElement | null>(null);
  const inlineLastPointRef = useRef<CanvasPoint | null>(null);
  const inlineCurrentStrokeRef = useRef<InlineStroke | null>(null);
  const inlineRawStrokeRef = useRef<InlineStroke | null>(null);
  const inlineDrawFrameRef = useRef<number | null>(null);
  const [imageNaturalSizes, setImageNaturalSizes] = useState<
    Record<number, { width: number; height: number }>
  >({});
  const [viewportSize, setViewportSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1366,
    height: typeof window !== "undefined" ? window.innerHeight : 768,
  });

  const groups = groupByLesson(questions);
  const currentQuestion = questions[currentIndex];
  const currentImageNaturalSize = currentQuestion
    ? imageNaturalSizes[currentQuestion.id]
    : undefined;
  const currentInlineStrokes = currentQuestion
    ? (inlineDrawingsByQuestion[currentQuestion.id] ?? [])
    : [];
  const shouldShowInlineCanvas =
    inlineDrawEnabled || finished || currentInlineStrokes.length > 0;
  const inlineImageDisplaySize = useMemo(() => {
    if (!currentImageNaturalSize?.width || !currentImageNaturalSize?.height)
      return null;
    const padding = viewportSize.width >= 640 ? 24 : 16;
    const frameMaxWidth = Math.max(
      320,
      viewportSize.width - (viewportSize.width >= 1024 ? 440 : 28),
    );
    const frameMaxHeight = clamp(
      viewportSize.width >= 1024
        ? viewportSize.height - 250
        : viewportSize.height - 320,
      340,
      860,
    );
    const availableWidth = Math.max(240, frameMaxWidth - padding * 2 - 4);
    const availableHeight = Math.max(240, frameMaxHeight - padding * 2 - 4);
    const scale = Math.min(
      1,
      availableWidth / currentImageNaturalSize.width,
      availableHeight / currentImageNaturalSize.height,
    );

    return {
      width: Math.max(1, Math.round(currentImageNaturalSize.width * scale)),
      height: Math.max(1, Math.round(currentImageNaturalSize.height * scale)),
    };
  }, [currentImageNaturalSize, viewportSize.height, viewportSize.width]);

  const cancelInlineDrawFrame = useCallback(() => {
    if (inlineDrawFrameRef.current !== null) {
      window.cancelAnimationFrame(inlineDrawFrameRef.current);
      inlineDrawFrameRef.current = null;
    }
  }, []);

  const handleTempCanvasSave = useCallback(
    (data: string) => {
      if (!currentQuestion) return;
      setTempDrawings((prev) => {
        if (prev[currentQuestion.id] === data) return prev;
        return {
          ...prev,
          [currentQuestion.id]: data,
        };
      });
    },
    [currentQuestion],
  );

  // Timer
  const timeLimitSeconds: number | null =
    (test as any)?.timeLimitSeconds ?? null;
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handleFinishRef = useRef<((forced?: boolean) => Promise<void>) | null>(
    null,
  );
  const finishRef = useRef(false);
  const draftHydratedRef = useRef(false);
  const solutionsPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const progressPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const reviewPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [showExitDialog, setShowExitDialog] = useState(false);
  /** Taslak okunana kadar kaydetme - boş state ile üzerine yazmayı önler */
  const [draftReady, setDraftReady] = useState(false);

  useEffect(() => {
    draftHydratedRef.current = false;
    finishRef.current = false;
    setDraftReady(false);
    setFinished(false);
    setReviewViewMode("summary");
  }, [testId]);

  useEffect(() => {
    const onResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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

      try {
        const snapshot: TestReviewSnapshotV1 = {
          version: 1,
          answers: { ...answers },
          manualStatuses: snapshotStatuses as Record<number, string>,
          currentIndex,
          tempDrawings: { ...tempDrawings },
          inlineDrawingsByQuestion: { ...inlineDrawingsByQuestion } as Record<
            number,
            InlineStroke[]
          >,
          elapsed,
          collapsedLessons: { ...collapsedLessons },
          inlineDrawEnabled: false,
        };

        await Promise.all([
          storage.saveSolutions(
            buildTestSolutionsInput({
              answers: snapshot.answers,
              tempDrawings: snapshot.tempDrawings ?? {},
              inlineDrawingsByQuestion: snapshot.inlineDrawingsByQuestion ?? {},
              inlineDrawEnabled: false,
              isCompleted: true,
              manualStatuses: snapshot.manualStatuses,
            }),
          ),
          storage.saveProgress({
            currentIndex,
            elapsed,
            isCompleted: true,
            inlineDrawEnabled: false,
            collapsedLessons,
          }),
        ]);

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
          }),
        );
        try {
          await updateTestMutation.mutateAsync({
            id: testId,
            data: { completedAt: new Date().toISOString() },
          });
        } catch {
          /* Sunucu hatasi - yine de yerel gozden gecirme kaydi tutulur */
        }

        try {
          await fetch(`/api/tests/${testId}/finalize`, { method: "POST" });
        } catch {
          /* finalize endpoint basarisiz olsa da test kapanisi devam etmeli */
        }

        try {
          localStorage.setItem(testReviewKey(testId), JSON.stringify(snapshot));
        } catch {
          /* quota */
        }

        setManualStatuses(snapshotStatuses);
        setInlineDrawEnabled(false);
        setReviewViewMode("summary");

        await queryClient.invalidateQueries({
          queryKey: getListQuestionsQueryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getListTestsQueryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getGetTestQueryKey(testId),
        });
        setFinished(true);
        setLocation(`/tests/${testId}/result`);
      } catch (error) {
        finishRef.current = false;
        console.error("Failed to finish test:", error);
      }
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
    ],
  );

  useEffect(() => {
    handleFinishRef.current = handleFinish;
  }, [handleFinish]);

  useEffect(() => {
    if (!test) return;
    if (sessionCompleted) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (
          timeLimitSeconds &&
          next >= timeLimitSeconds &&
          !finishRef.current
        ) {
          void handleFinishRef.current?.(true);
        }
        return next;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [test?.id, sessionCompleted, timeLimitSeconds]);

  // Taslak veya tamamlanmış test gözden geçirme yükleme
  useEffect(() => {
    if (!test?.id || questions.length === 0 || draftHydratedRef.current) return;
    draftHydratedRef.current = true;

    if (sessionCompleted) {
      if (!allowCompletedReview) {
        setLocation(`/tests/${testId}/result`);
        setDraftReady(true);
        return;
      }

      const loadCompletedForReview = async () => {
        try {
          const [solutions, progress] = await Promise.all([
            storage.loadSolutions(),
            storage.loadProgress(),
          ]);

          const dbAnswers: Record<number, string> = {};
          const dbManualStatuses: Record<number, QStatus> = {};
          const dbTempDrawings: Record<number, string> = {};
          const dbInlineDrawings: Record<number, InlineStroke[]> = {};

          solutions.forEach((solution) => {
            if (solution.userAnswer)
              dbAnswers[solution.questionId] = solution.userAnswer;
            dbManualStatuses[solution.questionId] =
              (solution.status as QStatus) || "Cozulmedi";
            if (solution.tempDrawing)
              dbTempDrawings[solution.questionId] = solution.tempDrawing;
            if (solution.inlineDrawings)
              dbInlineDrawings[solution.questionId] =
                solution.inlineDrawings as InlineStroke[];
          });

          setAnswers(dbAnswers);
          setManualStatuses(dbManualStatuses);
          setTempDrawings(dbTempDrawings);
          setInlineDrawingsByQuestion(dbInlineDrawings);

          if (progress) {
            setCurrentIndex(
              Math.min(
                Math.max(0, progress.currentIndex ?? 0),
                questions.length - 1,
              ),
            );
            setElapsed(Math.max(0, progress.elapsed ?? 0));
            if (progress.collapsedLessons)
              setCollapsedLessons(progress.collapsedLessons);
          }
        } catch (error) {
          console.error("Failed to load completed review data:", error);
        } finally {
          setInlineDrawEnabled(false);
          setFinished(true);
          setReviewViewMode("kontrol");
          setDraftReady(true);
        }
      };

      void loadCompletedForReview();
      return;
    }

    try {
      const raw = localStorage.getItem(testDraftKey(testId));
      if (raw) {
        const d = JSON.parse(raw) as TestDraftV1;
        if (d.version === 1) {
          setAnswers(d.answers ?? {});
          setCurrentIndex(
            Math.min(Math.max(0, d.currentIndex ?? 0), questions.length - 1),
          );
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

    // Load from database if localStorage is empty or for cross-device sync
    const loadFromDatabase = async () => {
      try {
        const [solutions, progress] = await Promise.all([
          storage.loadSolutions(),
          storage.loadProgress(),
        ]);

        // Merge database data with localStorage (localStorage takes priority)
        if (solutions.length > 0 || progress) {
          const dbAnswers: Record<number, string> = {};
          const dbTempDrawings: Record<number, string> = {};
          const dbInlineDrawings: Record<number, InlineStroke[]> = {};

          solutions.forEach((solution) => {
            if (solution.userAnswer) {
              dbAnswers[solution.questionId] = solution.userAnswer;
            }
            if (solution.tempDrawing) {
              dbTempDrawings[solution.questionId] = solution.tempDrawing;
            }
            if (solution.inlineDrawings) {
              dbInlineDrawings[solution.questionId] =
                solution.inlineDrawings as InlineStroke[];
            }
          });

          // Use database data if it's newer or localStorage is empty
          const localStorageData = localStorage.getItem(testDraftKey(testId));
          let shouldUseDatabase = !localStorageData;

          if (localStorageData) {
            try {
              const localDraft = JSON.parse(localStorageData) as TestDraftV1;
              // If database has newer data, use database
              if (progress && progress.elapsed > (localDraft.elapsed || 0)) {
                shouldUseDatabase = true;
              }
            } catch {
              shouldUseDatabase = true;
            }
          }

          if (shouldUseDatabase) {
            setAnswers(dbAnswers);
            setTempDrawings(dbTempDrawings);
            setInlineDrawingsByQuestion(dbInlineDrawings);

            if (progress) {
              setCurrentIndex(
                Math.min(
                  Math.max(0, progress.currentIndex ?? 0),
                  questions.length - 1,
                ),
              );
              setElapsed(Math.max(0, progress.elapsed ?? 0));
              if (progress.collapsedLessons)
                setCollapsedLessons(progress.collapsedLessons);
              setInlineDrawEnabled(!!progress.inlineDrawEnabled);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load from database:", error);
      }
    };

    void loadFromDatabase().finally(() => {
      setDraftReady(true);
    });
  }, [
    test?.id,
    testId,
    questions.length,
    sessionCompleted,
    allowCompletedReview,
  ]);

  // Taslak kaydet (test bitene kadar; tamamlanmış testte taslak yok)
  useEffect(() => {
    if (!testId || finished || !draftReady || sessionCompleted) return;
    if (solutionsPersistTimerRef.current)
      clearTimeout(solutionsPersistTimerRef.current);
    solutionsPersistTimerRef.current = setTimeout(() => {
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
        storage
          .saveSolutions(
            buildTestSolutionsInput({
              answers: draft.answers,
              tempDrawings: draft.tempDrawings,
              inlineDrawingsByQuestion: draft.inlineDrawingsByQuestion,
              inlineDrawEnabled: draft.inlineDrawEnabled,
              isCompleted: false,
            }),
          )
          .catch(() => {});
      } catch {
        /* quota */
      }
    }, 700);
    return () => {
      if (solutionsPersistTimerRef.current)
        clearTimeout(solutionsPersistTimerRef.current);
    };
  }, [
    testId,
    finished,
    draftReady,
    answers,
    tempDrawings,
    inlineDrawingsByQuestion,
    inlineDrawEnabled,
    sessionCompleted,
  ]);

  useEffect(() => {
    if (!testId || finished || !draftReady || sessionCompleted) return;
    if (progressPersistTimerRef.current)
      clearTimeout(progressPersistTimerRef.current);
    progressPersistTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(
          testDraftKey(testId),
          JSON.stringify({
            version: 1,
            answers,
            currentIndex,
            tempDrawings,
            inlineDrawingsByQuestion,
            elapsed,
            collapsedLessons,
            inlineDrawEnabled,
          } satisfies TestDraftV1),
        );
        storage
          .saveProgress({
            currentIndex,
            elapsed,
            collapsedLessons,
            inlineDrawEnabled,
          })
          .catch(() => {});
      } catch {
        /* quota */
      }
    }, 1200);
    return () => {
      if (progressPersistTimerRef.current)
        clearTimeout(progressPersistTimerRef.current);
    };
  }, [
    testId,
    finished,
    draftReady,
    currentIndex,
    elapsed,
    collapsedLessons,
    inlineDrawEnabled,
    sessionCompleted,
    answers,
    tempDrawings,
    inlineDrawingsByQuestion,
  ]);

  // Gözden geçirme (kontrol) sırasında indeks / çizimleri yerelde güncelle
  useEffect(() => {
    if (!testId || !finished || reviewViewMode !== "kontrol" || !draftReady)
      return;
    if (reviewPersistTimerRef.current)
      clearTimeout(reviewPersistTimerRef.current);
    reviewPersistTimerRef.current = setTimeout(() => {
      const snap: TestReviewSnapshotV1 = {
        version: 1,
        answers: { ...answers },
        manualStatuses: manualStatuses as Record<number, string>,
        currentIndex,
        tempDrawings: { ...tempDrawings },
        inlineDrawingsByQuestion: { ...inlineDrawingsByQuestion } as Record<
          number,
          InlineStroke[]
        >,
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
      if (reviewPersistTimerRef.current)
        clearTimeout(reviewPersistTimerRef.current);
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

  // Derived
  // Cevap seçimi için readOnly - kontrol modunda cevaplar değiştirilemez
  const readOnly = finished && reviewViewMode === "kontrol";
  // Çizim için ayrı kontrol - kontrol modunda da çizim yapılabilir
  const drawingReadOnly = false; // Her zaman çizim yapılabilir

  useEffect(() => {
    const wrap = inlineCanvasHostRef.current;
    const canvas = inlineCanvasRef.current;
    if (!wrap || !canvas || !currentQuestion?.imageUrl) return;

    const resize = () => {
      const prepared = prepareInlineCanvas(canvas);
      if (!prepared) return;

      redrawInlineCanvas(
        prepared.ctx,
        currentInlineStrokes,
        prepared.width,
        prepared.height,
        inlineCurrentStrokeRef.current,
        inlineEraserMode,
      );
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [
    currentQuestion?.id,
    currentQuestion?.imageUrl,
    currentInlineStrokes,
    inlineDrawEnabled,
    inlineEraserMode,
    readOnly,
    shouldShowInlineCanvas,
  ]);

  useEffect(() => {
    const canvas = inlineCanvasRef.current;
    if (!canvas) return;
    const prepared = prepareInlineCanvas(canvas);
    if (!prepared) return;
    redrawInlineCanvas(
      prepared.ctx,
      currentInlineStrokes,
      prepared.width,
      prepared.height,
      inlineCurrentStrokeRef.current,
      inlineEraserMode,
    );
  }, [currentQuestion?.id, currentInlineStrokes, inlineEraserMode]);

  const scheduleInlineCanvasRedraw = useCallback(() => {
    if (typeof window === "undefined") return;
    if (inlineDrawFrameRef.current !== null) return;
    inlineDrawFrameRef.current = window.requestAnimationFrame(() => {
      inlineDrawFrameRef.current = null;
      const canvas = inlineCanvasRef.current;
      if (!canvas || !currentQuestion) return;
      const prepared = prepareInlineCanvas(canvas);
      if (!prepared) return;
      const existingStrokes =
        inlineDrawingsByQuestion[currentQuestion.id] ?? [];
      redrawInlineCanvas(
        prepared.ctx,
        existingStrokes,
        prepared.width,
        prepared.height,
        inlineCurrentStrokeRef.current,
        inlineEraserMode,
      );
    });
  }, [currentQuestion, inlineDrawingsByQuestion, inlineEraserMode]);

  useEffect(() => cancelInlineDrawFrame, [cancelInlineDrawFrame]);

  const getInlinePointFromClient = (
    clientX: number,
    clientY: number,
    pressure = 0.5,
  ): CanvasPoint => {
    const canvas = inlineCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const rawPressure = pressure > 0 ? pressure : 0.5;
    const x = clamp(clientX - rect.left, 0, rect.width);
    const y = clamp(clientY - rect.top, 0, rect.height);
    return {
      x,
      y,
      pressure: curveInlinePressure(rawPressure),
    };
  };

  const getInlinePoint = (
    e: React.PointerEvent<HTMLCanvasElement>,
  ): CanvasPoint => getInlinePointFromClient(e.clientX, e.clientY, e.pressure);

  const releaseInlinePointerCaptureSafely = (
    target: EventTarget | null,
    pointerId: number,
  ) => {
    if (!(target instanceof HTMLElement)) return;
    try {
      if (target.hasPointerCapture(pointerId))
        target.releasePointerCapture(pointerId);
    } catch {
      // Pointer capture may already be gone after OS-level gesture cancellation.
    }
  };

  const drawInlineSegment = (
    from: CanvasPoint,
    to: CanvasPoint,
    stroke: InlineStroke,
  ) => {
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
    if (!inlineDrawEnabled) return;
    const EDGE_PAD = 8;
    const clamp = (value: number, min: number, max: number) =>
      Math.min(max, Math.max(min, value));
    const sync = (e: PointerEvent) => {
      const canvas = inlineCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const inBounds =
        e.clientX >= rect.left - EDGE_PAD &&
        e.clientX <= rect.right + EDGE_PAD &&
        e.clientY >= rect.top - EDGE_PAD &&
        e.clientY <= rect.bottom + EDGE_PAD;
      if (!inBounds && !isInlineDrawingRef.current) {
        setInlineCursorInCanvas(false);
        setInlineCursorPos(null);
        return;
      }
      setInlineCursorInCanvas(true);
      setInlineCursorPos({
        x: clamp(e.clientX - rect.left, 0, rect.width),
        y: clamp(e.clientY - rect.top, 0, rect.height),
      });
    };
    window.addEventListener("pointermove", sync, { passive: true });
    return () => window.removeEventListener("pointermove", sync);
  }, [inlineDrawEnabled, currentQuestion?.id]);

  useEffect(() => {
    if (inlineDrawEnabled) return;
    setInlineCursorInCanvas(false);
    setInlineCursorPos(null);
  }, [inlineDrawEnabled]);

  const remaining =
    timeLimitSeconds !== null ? timeLimitSeconds - elapsed : null;
  const timerLabel =
    remaining !== null
      ? formatTime(Math.max(0, remaining))
      : formatTime(elapsed);
  const timerIsWarning = remaining !== null && remaining <= 60;

  // Loading / Empty
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

  // Sonuç özeti (bitiş veya tamamlanmış teste giriş)
  if (finished && reviewViewMode === "summary") {
    const correct = questions.filter(
      (q) => (manualStatuses[q.id] ?? q.status) === "DogruCozuldu",
    ).length;
    const wrong = questions.filter(
      (q) => (manualStatuses[q.id] ?? q.status) === "YanlisHocayaSor",
    ).length;
    const skipped = questions.length - correct - wrong;

    return (
      <div className="h-screen bg-background flex flex-col">
        <header className="glass-panel h-16 flex items-center justify-between border-b border-border/50 px-6 shrink-0">
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
            <div className="apple-surface rounded-[1.75rem] p-5 text-center">
              <div className="text-3xl font-bold text-green-500">{correct}</div>
              <div className="text-sm text-green-400 mt-1 font-medium">
                Doğru
              </div>
            </div>
            <div className="apple-surface rounded-[1.75rem] p-5 text-center">
              <div className="text-3xl font-bold text-destructive">{wrong}</div>
              <div className="text-sm text-destructive/80 mt-1 font-medium">
                Yanlış
              </div>
            </div>
            <div className="apple-surface rounded-[1.75rem] p-5 text-center">
              <div className="text-3xl font-bold text-muted-foreground">
                {skipped}
              </div>
              <div className="text-sm text-muted-foreground mt-1 font-medium">
                Boş
              </div>
            </div>
            <div className="apple-surface rounded-[1.75rem] p-5 text-center">
              <div className="text-3xl font-bold text-primary font-mono">
                {formatTime(elapsed)}
              </div>
              <div className="text-sm text-primary/70 mt-1 font-medium">
                Süre
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <Button
              className="rounded-xl gap-2 font-semibold"
              onClick={() => setReviewViewMode("kontrol")}
            >
              <ClipboardCheck className="w-4 h-4" /> Soruları kontrol et
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setLocation("/tests")}
            >
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
                  const status: QStatus = (manualStatuses[q.id] ??
                    q.status) as QStatus;
                  const userAnswer = answers[q.id];
                  return (
                    <div
                      key={q.id}
                      className="apple-surface flex items-center gap-3 rounded-[1.4rem] p-3"
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
                              <strong className="text-foreground">
                                {userAnswer}
                              </strong>
                            </span>
                          )}
                          {q.choice && (
                            <span>
                              · Doğru şık:{" "}
                              <strong className="text-primary">
                                {q.choice}
                              </strong>
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
                              : "text-muted-foreground",
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

  // Test Screen (çözüm veya gözden geçirme / kontrol)
  const answeredCount = Object.keys(answers).length;
  const solutionVideoUrl =
    currentQuestion?.solutionYoutubeUrl || currentQuestion?.solutionUrl;
  const solutionEmbed = getYoutubeEmbedSrc(
    solutionVideoUrl,
    currentQuestion?.solutionYoutubeStartSecond,
    currentQuestion?.solutionYoutubeEndSecond,
  );
  const solutionRangeLabel = formatVideoTimestampRange(
    currentQuestion?.solutionYoutubeStartSecond,
    currentQuestion?.solutionYoutubeEndSecond,
  );
  const hasManualOptionTexts =
    normalizeQuestionOptions(currentQuestion?.options).length > 0;
  const adaptiveImageFrameStyle = (() => {
    const padding = viewportSize.width >= 640 ? 24 : 16;
    if (!currentQuestion?.imageUrl) {
      return { width: "100%", minHeight: "320px", maxHeight: "72vh" };
    }

    const frameMaxWidth = Math.max(
      320,
      viewportSize.width - (viewportSize.width >= 1024 ? 440 : 28),
    );
    const frameMaxHeight = clamp(
      viewportSize.width >= 1024
        ? viewportSize.height - 250
        : viewportSize.height - 320,
      340,
      860,
    );

    if (currentImageNaturalSize?.width && currentImageNaturalSize?.height) {
      const availableWidth = Math.max(240, frameMaxWidth - padding * 2 - 4);
      const availableHeight = Math.max(240, frameMaxHeight - padding * 2 - 4);
      const scale = Math.min(
        1,
        availableWidth / currentImageNaturalSize.width,
        availableHeight / currentImageNaturalSize.height,
      );
      const imageWidth = Math.max(
        1,
        Math.round(currentImageNaturalSize.width * scale),
      );
      const imageHeight = Math.max(
        1,
        Math.round(currentImageNaturalSize.height * scale),
      );

      return {
        width: `${imageWidth + padding * 2 + 4}px`,
        maxWidth: "100%",
        height: `${imageHeight + padding * 2 + 4}px`,
      };
    }

    return {
      width: "100%",
      maxWidth: `${Math.round(frameMaxWidth)}px`,
      height: `${Math.round(frameMaxHeight)}px`,
      minHeight: "340px",
    };
  })();

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top bar */}
      <header className="glass-panel z-10 flex h-14 items-center justify-between border-b border-border/50 px-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              readOnly ? setReviewViewMode("summary") : setShowExitDialog(true)
            }
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
              : "bg-muted/30 border-border/40 text-foreground",
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
          {currentQuestion.imageUrl && (
            <div className="flex max-w-[56vw] items-center gap-1 overflow-x-auto rounded-[1.35rem] border border-border/60 bg-card/82 px-2.5 py-1.5 shadow-[0_16px_32px_-24px_rgba(15,23,42,0.3)]">
              <Button
                variant={inlineDrawEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => setInlineDrawEnabled((v) => !v)}
                className="h-8 gap-1.5 rounded-[0.95rem] px-3"
              >
                <Pencil className="w-3.5 h-3.5" /> Kalem
              </Button>
              <Button
                variant={inlineTool === "pen" ? "default" : "ghost"}
                size="icon"
                onClick={() => setInlineTool("pen")}
                disabled={!inlineDrawEnabled}
                className="h-8 w-8 rounded-[0.95rem]"
                title="Kalem"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={inlineTool === "eraser" ? "default" : "ghost"}
                size="icon"
                onClick={() => setInlineTool("eraser")}
                disabled={!inlineDrawEnabled}
                className="h-8 w-8 rounded-[0.95rem]"
                title="Silgi"
              >
                <Eraser className="w-3.5 h-3.5" />
              </Button>
              {inlineTool === "pen" && (
                <div className="flex items-center gap-1.5 px-1">
                  {["#111827", "#0a84ff", "#34c759", "#ff9f0a", "#ff375f"].map(
                    (c) => (
                      <button
                        key={c}
                        type="button"
                        disabled={!inlineDrawEnabled}
                        onClick={() => setInlineColor(c)}
                        className={cn(
                          "h-6 w-6 rounded-full border-2 border-white/70 transition-transform disabled:opacity-40",
                          inlineColor === c
                            ? "scale-110 border-foreground shadow-[0_10px_18px_-10px_rgba(15,23,42,0.45)]"
                            : "",
                        )}
                        style={{ backgroundColor: c }}
                        title="Renk"
                      />
                    ),
                  )}
                </div>
              )}
              {inlineTool === "eraser" && (
                <>
                  <Button
                    variant={inlineEraserMode === "area" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setInlineEraserMode("area")}
                    disabled={!inlineDrawEnabled}
                    className="h-8 rounded-[0.95rem] px-2.5 text-[10px]"
                  >
                    Alan
                  </Button>
                  <Button
                    variant={
                      inlineEraserMode === "stroke" ? "default" : "ghost"
                    }
                    size="sm"
                    onClick={() => setInlineEraserMode("stroke")}
                    disabled={!inlineDrawEnabled}
                    className="h-8 rounded-[0.95rem] px-2.5 text-[10px]"
                  >
                    Çizgi
                  </Button>
                </>
              )}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!inlineDrawEnabled}
                  className="h-6 w-6 rounded-lg"
                  onClick={() => {
                    const value = Math.max(
                      1,
                      (inlineTool === "eraser"
                        ? inlineEraserWidth
                        : inlinePenWidth) - 1,
                    );
                    if (inlineTool === "eraser") setInlineEraserWidth(value);
                    else setInlinePenWidth(value);
                  }}
                >
                  -
                </Button>
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={
                    inlineTool === "eraser" ? inlineEraserWidth : inlinePenWidth
                  }
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (inlineTool === "eraser") setInlineEraserWidth(value);
                    else setInlinePenWidth(value);
                  }}
                  disabled={!inlineDrawEnabled}
                  className="w-20 accent-[hsl(var(--primary))]"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!inlineDrawEnabled}
                  className="h-6 w-6 rounded-lg"
                  onClick={() => {
                    const value = Math.min(
                      100,
                      (inlineTool === "eraser"
                        ? inlineEraserWidth
                        : inlinePenWidth) + 1,
                    );
                    if (inlineTool === "eraser") setInlineEraserWidth(value);
                    else setInlinePenWidth(value);
                  }}
                >
                  +
                </Button>
              </div>
              <Button
                variant="ghost"
                size="icon"
                disabled={!inlineDrawEnabled}
                className="h-8 w-8 rounded-[0.95rem]"
                title="Bu sorunun çizimini temizle"
                onClick={() => {
                  const canvas = inlineCanvasRef.current;
                  if (!canvas || !currentQuestion) return;
                  const prepared = prepareInlineCanvas(canvas);
                  if (!prepared) return;
                  prepared.ctx.clearRect(0, 0, prepared.width, prepared.height);
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
          <div className="w-full max-w-5xl">
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
              {finished && (
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

            <div className="apple-surface mb-4 overflow-hidden rounded-[1.9rem]">
              {currentQuestion.imageUrl ? (
                <div
                  ref={inlineImageWrapRef}
                  className="relative mx-auto flex items-start justify-center bg-white border-2 border-white rounded-[1.4rem]"
                  style={{
                    ...adaptiveImageFrameStyle,
                    overflow: "hidden",
                    cursor: inlineDrawEnabled ? "none" : "auto",
                  }}
                >
                  <div
                    ref={inlineCanvasHostRef}
                    className="relative flex shrink-0 items-start justify-center overflow-hidden p-4 leading-none sm:p-6"
                    style={{
                      width: "100%",
                      height: "100%",
                      maxWidth: "100%",
                      maxHeight: "100%",
                    }}
                  >
                    <img
                      ref={inlineImageRef}
                      src={currentQuestion.imageUrl}
                      alt="Soru"
                      className="block shrink-0 rounded object-contain"
                      style={{
                        width: inlineImageDisplaySize
                          ? `${inlineImageDisplaySize.width}px`
                          : "100%",
                        height: inlineImageDisplaySize
                          ? `${inlineImageDisplaySize.height}px`
                          : "100%",
                        maxWidth: "100%",
                        maxHeight: "100%",
                      }}
                      onLoad={(event) => {
                        if (!currentQuestion?.id) return;
                        const image = event.currentTarget;
                        const naturalWidth = image.naturalWidth || image.width;
                        const naturalHeight =
                          image.naturalHeight || image.height;
                        if (naturalWidth <= 0 || naturalHeight <= 0) return;
                        setImageNaturalSizes((prev) => {
                          const current = prev[currentQuestion.id];
                          if (
                            current?.width === naturalWidth &&
                            current?.height === naturalHeight
                          )
                            return prev;
                          return {
                            ...prev,
                            [currentQuestion.id]: {
                              width: naturalWidth,
                              height: naturalHeight,
                            },
                          };
                        });
                        window.requestAnimationFrame(() =>
                          scheduleInlineCanvasRedraw(),
                        );
                      }}
                    />
                    {shouldShowInlineCanvas && (
                      <canvas
                        ref={inlineCanvasRef}
                        className="absolute inset-0 z-10 block touch-none"
                        style={{
                          width: "100%",
                          height: "100%",
                          touchAction: "none",
                          cursor: inlineDrawEnabled ? "none" : "auto",
                          pointerEvents: inlineDrawEnabled ? "auto" : "none",
                        }}
                        onPointerDown={(e) => {
                          if (!inlineDrawEnabled) return;
                          e.preventDefault();
                          (e.currentTarget as HTMLElement).setPointerCapture(
                            e.pointerId,
                          );
                          setIsInlineDrawing(true);
                          isInlineDrawingRef.current = true;

                          const isHardwareEraser =
                            e.button === 5 || (e.buttons & 32) === 32;
                          if (e.pointerType === "pen") {
                            if (isHardwareEraser)
                              setInlineToolIfChanged("eraser");
                            else setInlineToolIfChanged("pen");
                          } else if (isHardwareEraser) {
                            setInlineToolIfChanged("eraser");
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
                            color:
                              activeTool === "eraser" ? "#000000" : inlineColor,
                            width:
                              activeTool === "eraser"
                                ? inlineEraserWidth
                                : inlinePenWidth,
                            points: [start],
                          };
                          inlineRawStrokeRef.current =
                            inlineCurrentStrokeRef.current;
                          scheduleInlineCanvasRedraw();
                        }}
                        onPointerMove={(e) => {
                          if (!inlineDrawEnabled) return;
                          const isHardwareEraser =
                            e.button === 5 || (e.buttons & 32) === 32;
                          if (e.pointerType === "pen") {
                            if (isHardwareEraser)
                              setInlineToolIfChanged("eraser");
                            else setInlineToolIfChanged("pen");
                          } else if (isHardwareEraser) {
                            setInlineToolIfChanged("eraser");
                          }

                          if (!isInlineDrawingRef.current) return;
                          e.preventDefault();
                          let last = inlineLastPointRef.current;
                          if (!last) {
                            inlineLastPointRef.current = getInlinePoint(e);
                            return;
                          }
                          if (!inlineCurrentStrokeRef.current) return;
                          const currentStroke = inlineCurrentStrokeRef.current;
                          const nativeEvent = e.nativeEvent as PointerEvent;
                          const coalesced =
                            typeof nativeEvent.getCoalescedEvents === "function"
                              ? nativeEvent.getCoalescedEvents()
                              : [];
                          const samples =
                            coalesced.length > 0 ? coalesced : [nativeEvent];
                          const pointStep =
                            currentStroke.tool === "eraser" ? 1.25 : 0.5;
                          let changed = false;

                          for (const sample of samples) {
                            const next = getInlinePointFromClient(
                              sample.clientX,
                              sample.clientY,
                              sample.pressure,
                            );
                            const dist = Math.hypot(
                              next.x - last.x,
                              next.y - last.y,
                            );
                            if (dist < pointStep) continue;
                            currentStroke.points.push(next);
                            last = next;
                            changed = true;
                          }

                          if (!changed) return;
                          currentStroke.snapShape = undefined;
                          inlineRawStrokeRef.current = currentStroke;
                          inlineCurrentStrokeRef.current = currentStroke;
                          scheduleInlineCanvasRedraw();
                          inlineLastPointRef.current = last;
                        }}
                        onPointerUp={(e) => {
                          if (!inlineDrawEnabled) return;
                          if (!isInlineDrawingRef.current) return;
                          e.preventDefault();
                          releaseInlinePointerCaptureSafely(
                            e.currentTarget,
                            e.pointerId,
                          );
                          cancelInlineDrawFrame();
                          const currentStroke = inlineCurrentStrokeRef.current;
                          if (currentStroke && currentQuestion) {
                            setInlineDrawingsByQuestion((prev) => {
                              const prevStrokes =
                                prev[currentQuestion.id] ?? [];
                              const nextStrokes =
                                currentStroke.tool === "eraser" &&
                                inlineEraserMode === "stroke"
                                  ? eraseInlineStrokesByPath(
                                      prevStrokes,
                                      currentStroke.points,
                                      Math.max(6, currentStroke.width / 2),
                                    )
                                  : [...prevStrokes, currentStroke];
                              return {
                                ...prev,
                                [currentQuestion.id]: nextStrokes,
                              };
                            });
                          }
                          setIsInlineDrawing(false);
                          isInlineDrawingRef.current = false;
                          inlineLastPointRef.current = null;
                          inlineCurrentStrokeRef.current = null;
                          inlineRawStrokeRef.current = null;
                        }}
                        onPointerCancel={(e) => {
                          releaseInlinePointerCaptureSafely(
                            e.currentTarget,
                            e.pointerId,
                          );
                          cancelInlineDrawFrame();
                          setIsInlineDrawing(false);
                          isInlineDrawingRef.current = false;
                          inlineLastPointRef.current = null;
                          inlineCurrentStrokeRef.current = null;
                          inlineRawStrokeRef.current = null;
                        }}
                      />
                    )}
                    {inlineDrawEnabled &&
                      inlineTool === "pen" &&
                      inlineCursorInCanvas &&
                      inlineCursorPos && (
                        <div
                          className="pointer-events-none absolute z-20 rounded-full"
                          style={{
                            left: inlineCursorPos.x,
                            top: inlineCursorPos.y,
                            width: 8,
                            height: 8,
                            transform: "translate(-50%, -50%)",
                            backgroundColor: inlineColor,
                            boxShadow:
                              "0 0 0 1px rgba(255,255,255,0.5), 0 0 0 2px rgba(0,0,0,0.3)",
                          }}
                        />
                      )}
                    {inlineDrawEnabled &&
                      inlineTool === "eraser" &&
                      inlineCursorInCanvas &&
                      inlineCursorPos && (
                        <div
                          className="pointer-events-none absolute z-20 rounded-full border-[2px] border-sky-500/80 bg-white/35 backdrop-blur-sm"
                          style={{
                            left: inlineCursorPos.x,
                            top: inlineCursorPos.y,
                            width: Math.max(
                              10,
                              Math.min(inlineEraserWidth, 120),
                            ),
                            height: Math.max(
                              10,
                              Math.min(inlineEraserWidth, 120),
                            ),
                            transform: "translate(-50%, -50%)",
                            boxShadow:
                              "0 14px 28px -14px rgba(15,23,42,0.45), inset 0 0 0 1px rgba(255,255,255,0.68)",
                          }}
                        />
                      )}
                  </div>
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

            {/* Choice bubbles (hidden when manual option texts are present) */}
            {!hasManualOptionTexts && (
              <div className="flex items-center justify-center gap-3 mb-4 flex-wrap">
                {getQuestionChoiceLabels(currentQuestion).map((c) => {
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
                          ? getReviewChoiceClasses(
                              c,
                              answers[currentQuestion.id],
                              currentQuestion.choice,
                            )
                          : selected
                            ? "bg-primary border-primary text-primary-foreground shadow-lg scale-110"
                            : "bg-background border-border/60 text-foreground hover:border-primary/60 hover:scale-105",
                      )}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            )}

            {normalizeQuestionOptions(currentQuestion.options).length > 0 && (
              <div className="mb-4 space-y-2 rounded-xl border border-border/40 bg-card/35 p-3">
                {getQuestionChoiceLabels(currentQuestion).map((label) => {
                  const optionText = getOptionText(currentQuestion, label);
                  if (!optionText) return null;
                  const selected = answers[currentQuestion.id] === label;
                  return (
                    <button
                      key={`text-${label}`}
                      type="button"
                      disabled={readOnly}
                      onClick={() => selectAnswer(currentQuestion.id, label)}
                      className={cn(
                        "w-full rounded-lg border px-5 py-4 text-left text-base transition-colors",
                        selected
                          ? "border-primary bg-primary/12 text-foreground"
                          : "border-border/50 bg-background/40 text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      <span className="font-semibold text-foreground">
                        {label}){" "}
                      </span>
                      <span className="inline-block origin-left scale-[1.12] sm:scale-[1.18] align-middle">
                        <MathLiveStatic
                          value={optionText}
                          className="text-[1.35rem] leading-relaxed text-foreground"
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between items-center">
              <Button
                variant="outline"
                onClick={() => setCurrentIndex((p) => Math.max(0, p - 1))}
                disabled={currentIndex === 0}
                className="rounded-xl"
              >
                ‹ Önceki
              </Button>
              {readOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCanvas(true)}
                  className="rounded-xl gap-2 hidden sm:flex"
                >
                  <Paintbrush className="w-4 h-4" /> Çözüm Tahtası
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
                Sonraki ›
              </Button>
            </div>
          </div>
        </main>

        {/* Answer panel */}
        <aside className="glass-panel hidden w-80 shrink-0 flex-col overflow-y-auto border-l border-border/50 md:flex">
          <div className="p-3 border-b border-border/40 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cevap Kağıdı
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
                              : "hover:bg-muted/30",
                          )}
                        >
                          <span
                            className={cn(
                              "text-xs font-bold w-5 shrink-0",
                              isCurrent
                                ? "text-primary"
                                : "text-muted-foreground",
                            )}
                          >
                            {index + 1}
                          </span>
                          <div className="flex gap-0.5">
                            {getQuestionChoiceLabels(q).map((c) => {
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
                                    "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border transition-all",
                                    readOnly
                                      ? getReviewChoiceClasses(
                                          c,
                                          userAnswer,
                                          q.choice,
                                        )
                                      : cn(
                                          "cursor-pointer",
                                          sel
                                            ? "bg-primary border-primary text-primary-foreground"
                                            : "border-border/50 text-muted-foreground hover:border-primary/50",
                                        ),
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
            <AlertDialogTitle className="font-display">
              Testten Çık
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left text-muted-foreground leading-relaxed">
              <strong className="text-foreground font-medium">
                Sonra devam et
              </strong>{" "}
              dersen işaretlediğin şıklar ve çizimler bu cihazda test bitene
              kadar saklanır.
              <br />
              <strong className="text-foreground font-medium">
                Testi bitir
              </strong>{" "}
              dersen sonuçlar kaydedilir ve test tamamlanmış sayılır (üstteki
              “Testi Bitir” ile aynı).
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
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {solutionRangeLabel}
              </p>
              <div className="aspect-video w-full overflow-hidden rounded-xl border border-border/40 bg-foreground/12">
                <iframe
                  src={solutionEmbed}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  title="Çözüm videosu"
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {solutionVideoUrl?.trim()
                ? "Bu adres YouTube olarak tanınmadı. Linki yeni sekmede açmayı deneyin."
                : "Bu soru için havuzda çözüm videosu linki eklenmemiş."}
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Drawing canvas modal — TEMPORARY, not saved to DB */}
      {showCanvas && (
        <div className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-md">
          <DrawingCanvas
            questionId={currentQuestion.id}
            imageUrl={currentQuestion.imageUrl}
            initialData={tempDrawings[currentQuestion.id]}
            noSave={true}
            onTempSave={handleTempCanvasSave}
            onClose={() => setShowCanvas(false)}
          />
        </div>
      )}
    </div>
  );
}

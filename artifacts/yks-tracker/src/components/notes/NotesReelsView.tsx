import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NotebookPen, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NoteCategory = "TYT" | "AYT";
type NoteType = "text" | "drawing";

type StudyNote = {
  id: string;
  category: NoteCategory;
  lesson: string;
  title: string;
  topic: string;
  noteType: NoteType;
  description: string;
  drawingData: string | null;
  pinned: boolean;
  updatedAt: string;
};

type FeedResponse = {
  items: StudyNote[];
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

type NotesReelsViewProps = {
  searchTerm: string;
  reloadSeed: number;
  onOpenNote: (note: StudyNote) => void;
};

type DrawingPayload = {
  overlay?: unknown[];
  board?: unknown[];
  previewDataUrl?: string | null;
};

type DrawingPoint = { x: number; y: number };
type DrawingStrokePreview = { tool: "pen" | "eraser"; color: string; width: number; points: DrawingPoint[] };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function hashToStickyColor(id: string) {
  const palette = [
    "bg-[#fff2d2] border-[#f4c979]/38 text-amber-950",
    "bg-[#ffe1df] border-[#f5a4ae]/34 text-rose-950",
    "bg-[#dde9ff] border-[#93b7ff]/34 text-sky-950",
    "bg-[#f1e5d7] border-[#d3b492]/34 text-stone-900",
    "bg-[#eadfff] border-[#b79df4]/34 text-violet-950",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function getDrawingPreviewUrl(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DrawingPayload | unknown[];
    if (Array.isArray(parsed)) return null;
    if (parsed && typeof parsed === "object" && typeof parsed.previewDataUrl === "string") {
      return parsed.previewDataUrl;
    }
  } catch {
    if (typeof raw === "string" && raw.startsWith("data:image/")) return raw;
  }
  return null;
}

function getPreviewStrokes(raw?: string | null): DrawingStrokePreview[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as DrawingPayload | unknown[];
    const payload = Array.isArray(parsed) ? { overlay: parsed, board: [] } : parsed;
    const source = Array.isArray(payload?.board) && payload.board.length > 0 ? payload.board : payload?.overlay;
    if (!Array.isArray(source)) return [];
    return source
      .map((stroke) => {
        if (!stroke || typeof stroke !== "object") return null;
        const candidate = stroke as Record<string, unknown>;
        const points = Array.isArray(candidate.points)
          ? candidate.points
              .map((point) => {
                if (!point || typeof point !== "object") return null;
                const p = point as Record<string, unknown>;
                const x = typeof p.x === "number" ? p.x : null;
                const y = typeof p.y === "number" ? p.y : null;
                return x === null || y === null ? null : { x, y };
              })
              .filter((p): p is DrawingPoint => p !== null)
          : [];
        if (points.length === 0) return null;
        return {
          tool: candidate.tool === "eraser" ? "eraser" : "pen",
          color: typeof candidate.color === "string" ? candidate.color : "#1d4ed8",
          width: typeof candidate.width === "number" ? candidate.width : 8,
          points,
        } satisfies DrawingStrokePreview;
      })
      .filter((stroke): stroke is DrawingStrokePreview => stroke !== null && stroke.tool === "pen");
  } catch {
    return [];
  }
}

function DrawingPreviewCard({ drawingData, title }: { drawingData?: string | null; title: string }) {
  const previewUrl = useMemo(() => getDrawingPreviewUrl(drawingData), [drawingData]);
  const strokes = useMemo(() => getPreviewStrokes(drawingData), [drawingData]);

  if (previewUrl) {
    return (
      <div className="mx-auto mt-3 flex w-full aspect-[4/5] min-h-[260px] max-h-[420px] flex-none items-center justify-center overflow-hidden rounded-[1.8rem] border border-black/10 bg-white/45 p-1 shadow-inner">
        <img src={previewUrl} alt={`${title} önizleme`} className="h-full w-full rounded-[1.5rem] object-contain" />
      </div>
    );
  }

  if (strokes.length > 0) {
    const points = strokes.flatMap((s) => s.points);
    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const padding = Math.max(8, Math.max(width, height) * 0.08);
    const viewBox = `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`;

    return (
      <div className="mx-auto mt-3 flex w-full aspect-[4/5] min-h-[260px] max-h-[420px] flex-none items-center justify-center overflow-hidden rounded-[1.8rem] border border-black/10 bg-white/45 p-1 shadow-inner">
        <svg viewBox={viewBox} className="h-full w-full rounded-[1.5rem]" preserveAspectRatio="xMidYMid meet">
          {strokes.map((stroke, index) => (
            <polyline
              key={`${title}-${index}`}
              points={stroke.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={stroke.color}
              strokeWidth={Math.max(2, stroke.width * 0.45)}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
      </div>
    );
  }

  return <div className="mt-4 rounded-[1.6rem] border border-dashed border-black/15 bg-white/30 p-5 text-center text-sm">Çizim kaydı var, notu açınca görünür.</div>;
}

function ReelsCard({ note, onOpen }: { note: StudyNote; onOpen: (note: StudyNote) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(note)}
      className={cn(
        "relative mx-auto flex min-h-[72vh] w-full max-w-3xl flex-col justify-between overflow-hidden rounded-[1.8rem] border px-5 py-5 text-left shadow-[0_24px_60px_-28px_rgba(0,0,0,0.45)] transition hover:-translate-y-[1px] sm:px-7 sm:py-6",
        hashToStickyColor(note.id),
      )}
      data-feed-note-id={note.id}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full bg-black/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">{note.category}</span>
            <span className="inline-flex rounded-full bg-black/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">{note.lesson}</span>
          </div>
          <p className="line-clamp-2 pr-4 text-xl font-semibold sm:text-2xl">{note.title || "Adsız Not"}</p>
        </div>
        {note.pinned ? <Pin className="h-4 w-4 text-black/60" /> : null}
      </div>

      <p className="mt-4 text-sm opacity-75 sm:text-base">{note.topic || "Konu belirtilmedi"}</p>

      {note.noteType === "drawing" ? (
        <div className="flex-1 py-4">
          <DrawingPreviewCard drawingData={note.drawingData} title={note.title || "Not"} />
        </div>
      ) : (
        <p className="mt-5 flex-1 text-[25px] leading-[1.28] opacity-85 [font-family:'Caveat','SF_Pro_Display',cursive] sm:text-[28px]">{note.description || "Not açıklaması boş."}</p>
      )}

      <div className="mt-auto flex items-center justify-between pt-5 text-xs opacity-65 sm:text-sm">
        <span>{new Date(note.updatedAt).toLocaleDateString("tr-TR")}</span>
        <span>{note.noteType === "drawing" ? "Çizim" : "Metin"}</span>
      </div>
    </button>
  );
}

export function NotesReelsView({ searchTerm, reloadSeed, onOpenNote }: NotesReelsViewProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const recentIdsRef = useRef<string[]>([]);
  const lastServedAtRef = useRef<Record<string, number>>({});
  const notesRef = useRef<StudyNote[]>([]);
  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [currentVisibleId, setCurrentVisibleId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [algorithmText, setAlgorithmText] = useState("Yeni notları önce sık, sonra açılan aralıklarla tekrar gösterir.");
  const [feedbackPending, setFeedbackPending] = useState<"less_often" | "more_often" | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const fetchBatch = useCallback(async (replace: boolean) => {
    if (replace) setIsLoading(true);
    else setIsLoadingMore(true);

    try {
      const excludeIds = Array.from(new Set([...(replace ? [] : notesRef.current.map((note) => note.id)), ...recentIdsRef.current.slice(-18)]));
      const query = new URLSearchParams({
        limit: "6",
      });
      if (searchTerm.trim()) query.set("search", searchTerm.trim());
      if (excludeIds.length > 0) query.set("excludeIds", excludeIds.join(","));

      const response = await requestJson<FeedResponse>(`/api/notes/feed?${query.toString()}`);
      setAlgorithmText(response.algorithm?.description || "Yeni notları önce sık, sonra açılan aralıklarla tekrar gösterir.");
      setHasMore(response.pagination.hasMore || response.items.length > 0);
      setNotes((current) => {
        if (replace) return response.items;
        const existingIds = new Set(current.map((note) => note.id));
        return [...current, ...response.items.filter((note) => !existingIds.has(note.id))];
      });
    } finally {
      if (replace) setIsLoading(false);
      else setIsLoadingMore(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    recentIdsRef.current = [];
    lastServedAtRef.current = {};
    setCurrentVisibleId(null);
    setFeedbackPending(null);
    setFeedbackToast(null);
    void fetchBatch(true);
  }, [fetchBatch, reloadSeed]);

  useEffect(() => {
    const root = viewportRef.current;
    if (!root || notes.length === 0) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-feed-note-id]"));
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const nextId = visible?.target.getAttribute("data-feed-note-id") ?? null;
        if (nextId) setCurrentVisibleId(nextId);
      },
      { root, threshold: [0.35, 0.55, 0.72, 0.9] },
    );

    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [notes]);

  useEffect(() => {
    if (!currentVisibleId) return;
    setFeedbackPending(null);
    recentIdsRef.current = [...recentIdsRef.current.filter((id) => id !== currentVisibleId), currentVisibleId].slice(-24);

    const now = Date.now();
    if (lastServedAtRef.current[currentVisibleId] && now - lastServedAtRef.current[currentVisibleId] < 45000) {
      return;
    }
    lastServedAtRef.current[currentVisibleId] = now;
    void requestJson(`/api/notes/feed/serve/${encodeURIComponent(currentVisibleId)}`, { method: "POST" });

    const visibleIndex = notes.findIndex((note) => note.id === currentVisibleId);
    if (visibleIndex >= notes.length - 3 && hasMore && !isLoadingMore) {
      void fetchBatch(false);
    }
  }, [currentVisibleId, fetchBatch, hasMore, isLoadingMore, notes]);

  useEffect(() => {
    if (!feedbackToast) return;
    const timeout = window.setTimeout(() => setFeedbackToast(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [feedbackToast]);

  const currentVisibleNote = useMemo(
    () => notes.find((note) => note.id === currentVisibleId) ?? null,
    [currentVisibleId, notes],
  );

  const sendFeedback = useCallback(
    async (feedback: "less_often" | "more_often") => {
      if (!currentVisibleNote || feedbackPending) return;
      setFeedbackPending(feedback);
      try {
        await requestJson(`/api/notes/feed/feedback/${encodeURIComponent(currentVisibleNote.id)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ feedback }),
        });

        setFeedbackToast({
          tone: "success",
          text: feedback === "less_often" ? "Bu notu daha seyrek göstereceğim." : "Bu notu biraz daha sık göstereceğim.",
        });
        lastServedAtRef.current[currentVisibleNote.id] = Date.now();
      } catch {
        setFeedbackToast({
          tone: "error",
          text: "Geri bildirim kaydedilemedi, tekrar deneyebilirsin.",
        });
      } finally {
        setFeedbackPending(null);
      }
    },
    [currentVisibleNote, feedbackPending],
  );

  if (isLoading) {
    return <div className="rounded-2xl border border-slate-200 bg-white/80 p-8 text-center dark:border-white/10 dark:bg-white/5">Akış hazırlanıyor...</div>;
  }

  if (notes.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-8 text-center dark:border-white/10 dark:bg-white/5">
        <NotebookPen className="mx-auto h-10 w-10 text-primary/80" />
        <p className="mt-3 text-sm text-slate-600 dark:text-white/60">Akış için gösterilecek not bulunamadı. Not ekledikçe buraya düşecek.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-slate-500 dark:text-white/55">
        <p>{algorithmText}</p>
        <span>{notes.length} not akışta hazır</span>
      </div>
      <div className="relative">
        {feedbackToast ? (
          <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2">
            <div
              className={cn(
                "rounded-full px-4 py-2 text-xs font-medium shadow-[0_18px_50px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xl",
                feedbackToast.tone === "success"
                  ? "border border-emerald-300/60 bg-emerald-50/90 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/12 dark:text-emerald-100"
                  : "border border-rose-300/60 bg-rose-50/90 text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/12 dark:text-rose-100",
              )}
            >
              {feedbackToast.text}
            </div>
          </div>
        ) : null}

        <div
          ref={viewportRef}
          className="h-[80vh] overflow-y-auto snap-y snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {notes.map((note) => (
            <article key={note.id} className="snap-start py-2 sm:py-3">
              <ReelsCard note={note} onOpen={onOpenNote} />
            </article>
          ))}
          <div className="flex min-h-16 items-center justify-center py-4 text-sm text-slate-500 dark:text-white/55">
            {isLoadingMore ? "Sıradaki notlar hazırlanıyor..." : hasMore ? "Kaydırmaya devam et, yeni notlar geliyor." : "Şimdilik akışın sonuna geldin."}
          </div>
        </div>

        {currentVisibleNote ? (
          <div className="pointer-events-none fixed bottom-5 right-5 z-20 sm:bottom-6 sm:right-6">
            <div className="pointer-events-auto flex flex-col items-end gap-2">
              <span className="rounded-full border border-slate-200/70 bg-white/88 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-[#120f1fcc]/95 dark:text-white/60">
                Akış ayarı
              </span>
              <span className="rounded-full bg-slate-900/6 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-white/10 dark:text-white/60">
                {currentVisibleNote.lesson}
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-full border-violet-300/70 bg-white/92 px-4 text-violet-900 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl hover:bg-violet-50/95 dark:border-violet-500/20 dark:bg-[#120f1fcc]/95 dark:text-violet-100 dark:hover:bg-violet-500/12"
                onClick={() => void sendFeedback("less_often")}
                disabled={feedbackPending !== null}
              >
                {feedbackPending === "less_often" ? "Kaydediliyor..." : "Bunu çok sık görüyorum"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-full border-sky-300/70 bg-white/92 px-4 text-sky-900 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl hover:bg-sky-50/95 dark:border-sky-500/20 dark:bg-[#120f1fcc]/95 dark:text-sky-100 dark:hover:bg-sky-500/12"
                onClick={() => void sendFeedback("more_often")}
                disabled={feedbackPending !== null}
              >
                {feedbackPending === "more_often" ? "Kaydediliyor..." : "Bunu daha çok göster"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

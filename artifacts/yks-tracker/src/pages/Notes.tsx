import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, NotebookPen, Pin, PinOff, Plus, Search, StickyNote, Trash2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getLessonsForCategory, getTopicsForLesson } from "@/lib/lessonTopics";
import { DrawingCanvas } from "@/components/canvas/DrawingCanvas";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

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

type NotesProps = { category: NoteCategory };
type CreateNoteInput = {
  id: string;
  category: NoteCategory;
  lesson: string;
  title: string;
  topic: string | null;
  noteType: NoteType;
  description: string | null;
  drawingData: string | null;
  pinned: boolean;
};
type UpdateNoteInput = Partial<Omit<StudyNote, "id" | "updatedAt">>;
type NotesListResponse = {
  items: StudyNote[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

type DrawingPayload = {
  overlay?: unknown[];
  board?: unknown[];
  previewDataUrl?: string | null;
};
type DrawingPoint = { x: number; y: number };
type DrawingStrokePreview = { tool: "pen" | "eraser"; color: string; width: number; points: DrawingPoint[] };

function getPendingOpenNoteKey(category: NoteCategory) {
  return `yks_notes_pending_open_${category.toLowerCase()}`;
}

function parsePendingOpenNote(raw: string | null): { id: string; lesson?: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: string; lesson?: string };
    return parsed.id ? { id: parsed.id, lesson: parsed.lesson } : null;
  } catch {
    return { id: raw };
  }
}

function createNoteId() {
  const webCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (webCrypto && typeof webCrypto.randomUUID === "function") return webCrypto.randomUUID();
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createNote(lesson: string, noteType: NoteType, category: NoteCategory): StudyNote {
  return {
    id: createNoteId(),
    category,
    lesson,
    title: lesson ? `${lesson} Notu` : "Yeni Not",
    topic: "",
    noteType,
    description: "",
    drawingData: noteType === "drawing" ? "" : null,
    pinned: false,
    updatedAt: new Date().toISOString(),
  };
}

function hashToStickyColor(id: string) {
  const palette = [
    "bg-[#fef3c7] border-[#facc15]/40 text-amber-950",
    "bg-[#fecdd3] border-[#fb7185]/35 text-rose-950",
    "bg-[#bfdbfe] border-[#60a5fa]/35 text-sky-950",
    "bg-[#bbf7d0] border-[#4ade80]/35 text-emerald-950",
    "bg-[#e9d5ff] border-[#a78bfa]/35 text-violet-950",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function noteCanvasId(noteId: string) {
  let hash = 0;
  for (let i = 0; i < noteId.length; i++) hash = (hash * 31 + noteId.charCodeAt(i)) | 0;
  return Math.abs(hash) + 1000;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toLocaleDateString("tr-TR")} ${date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const listNotes = async (params: {
  category: NoteCategory;
  lesson?: string;
  search?: string;
  limit: number;
  offset: number;
}): Promise<NotesListResponse> => {
  const query = new URLSearchParams({
    category: params.category,
    limit: String(params.limit),
    offset: String(params.offset),
  });
  if (params.lesson) query.set("lesson", params.lesson);
  if (params.search) query.set("search", params.search);
  return requestJson<NotesListResponse>(`/api/notes?${query.toString()}`);
};
const createStudyNote = async (input: CreateNoteInput): Promise<StudyNote> => requestJson<StudyNote>("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
const updateStudyNote = async (id: string, input: UpdateNoteInput): Promise<StudyNote> => requestJson<StudyNote>(`/api/notes/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
const deleteStudyNote = async (id: string): Promise<void> => requestJson<void>(`/api/notes/${encodeURIComponent(id)}`, { method: "DELETE" });

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
      <div className="mx-auto mt-3 flex w-[92%] aspect-square min-h-[168px] max-h-[212px] flex-none items-center justify-center overflow-hidden rounded-2xl border border-black/10 bg-white/45 p-0.5 shadow-inner">
        <img src={previewUrl} alt={`${title} önizleme`} className="h-full w-full rounded-xl object-contain" />
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
      <div className="mx-auto mt-3 flex w-[92%] aspect-square min-h-[168px] max-h-[212px] flex-none items-center justify-center overflow-hidden rounded-2xl border border-black/10 bg-white/45 p-0.5 shadow-inner">
        <svg viewBox={viewBox} className="h-full w-full rounded-xl" preserveAspectRatio="xMidYMid meet">
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

  return <div className="mt-4 rounded-2xl border border-dashed border-black/15 bg-white/30 p-4 text-center text-sm">Çizim kaydı var, notu açınca görünür.</div>;
}

export default function Notes({ category }: NotesProps) {
  const [, navigate] = useLocation();
  const lessonTabs = useMemo(() => getLessonsForCategory(category).map((item) => item.name), [category]);
  const notesRef = useRef<StudyNote[]>([]);
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const drawingDraftsRef = useRef<Record<string, string>>({});
  const notesPerPage = 9;

  const [isLoading, setIsLoading] = useState(true);
  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [activeLesson, setActiveLesson] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newNoteCategory, setNewNoteCategory] = useState<NoteCategory>(category);
  const [newNoteType, setNewNoteType] = useState<NoteType>("text");
  const [newNoteLesson, setNewNoteLesson] = useState("");
  const [savingNoteIds, setSavingNoteIds] = useState<Record<string, boolean>>({});
  const [recentlySavedNoteId, setRecentlySavedNoteId] = useState<string | null>(null);
  const [pagination, setPagination] = useState<NotesListResponse["pagination"]>({
    total: 0,
    limit: notesPerPage,
    offset: 0,
    hasMore: false,
  });
  const [reloadSeed, setReloadSeed] = useState(0);
  const debouncedSearchTerm = useDebouncedValue(searchInput, 250);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const response = await listNotes({
          category,
          lesson: activeLesson || lessonTabs[0] || undefined,
          search: debouncedSearchTerm.trim() || undefined,
          limit: notesPerPage,
          offset: (currentPage - 1) * notesPerPage,
        });
        if (!cancelled) {
          setNotes(response.items);
          setPagination(response.pagination);
        }
      } catch {
        if (!cancelled) {
          setNotes([]);
          setPagination({
            total: 0,
            limit: notesPerPage,
            offset: 0,
            hasMore: false,
          });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeLesson, category, currentPage, debouncedSearchTerm, lessonTabs, notesPerPage, reloadSeed]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => () => {
    Object.values(saveTimersRef.current).forEach((timer) => clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (lessonTabs.length === 0) {
      setActiveLesson("");
      return;
    }
    if (!activeLesson || !lessonTabs.includes(activeLesson)) setActiveLesson(lessonTabs[0]);
  }, [activeLesson, lessonTabs]);

  useEffect(() => {
    try {
      const pending = parsePendingOpenNote(window.sessionStorage.getItem(getPendingOpenNoteKey(category)));
      if (pending?.lesson && pending.lesson !== activeLesson && lessonTabs.includes(pending.lesson)) {
        setActiveLesson(pending.lesson);
        setCurrentPage(1);
        return;
      }
      if (pending?.id && notes.some((note) => note.id === pending.id)) {
        setExpandedId(pending.id);
        window.sessionStorage.removeItem(getPendingOpenNoteKey(category));
      }
    } catch {
      // ignore
    }
  }, [activeLesson, category, lessonTabs, notes]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeLesson, category, searchInput]);

  useEffect(() => {
    if (!createDialogOpen) {
      setNewNoteCategory(category);
      return;
    }
    const lessons = getLessonsForCategory(newNoteCategory).map((item) => item.name);
    const fallbackLesson = newNoteCategory === category ? activeLesson || lessons[0] || "" : lessons[0] || "";
    if (!newNoteLesson || !lessons.includes(newNoteLesson)) setNewNoteLesson(fallbackLesson);
  }, [activeLesson, category, createDialogOpen, newNoteCategory, newNoteLesson]);

  const totalPages = Math.max(1, Math.ceil(pagination.total / notesPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);
  const visiblePageNumbers = useMemo(() => {
    const start = Math.max(1, safeCurrentPage - 2);
    const end = Math.min(totalPages, start + 4);
    const adjustedStart = Math.max(1, end - 4);
    return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);
  }, [safeCurrentPage, totalPages]);

  const expandedNote = useMemo(() => notes.find((note) => note.id === expandedId) ?? null, [notes, expandedId]);
  const expandedNoteTopics = useMemo(() => (expandedNote ? getTopicsForLesson(expandedNote.category, expandedNote.lesson) : []), [expandedNote]);

  const persistNote = async (noteId: string, patch?: UpdateNoteInput) => {
    const currentNote = notesRef.current.find((note) => note.id === noteId);
    if (!currentNote) return;
    const payload: UpdateNoteInput = patch ?? {
      category: currentNote.category,
      lesson: currentNote.lesson,
      title: currentNote.title,
      topic: currentNote.topic,
      noteType: currentNote.noteType,
      description: currentNote.description,
      drawingData: currentNote.drawingData,
      pinned: currentNote.pinned,
    };

    setSavingNoteIds((prev) => ({ ...prev, [noteId]: true }));
    try {
      const updated = await updateStudyNote(noteId, payload);
      setNotes((prev) => prev.map((note) => (note.id === noteId ? updated : note)));
      setRecentlySavedNoteId(noteId);
      window.setTimeout(() => setRecentlySavedNoteId((current) => (current === noteId ? null : current)), 1800);
    } finally {
      setSavingNoteIds((prev) => {
        const next = { ...prev };
        delete next[noteId];
        return next;
      });
    }
  };

  const queueSave = (noteId: string, patch: UpdateNoteInput) => {
    const timer = saveTimersRef.current[noteId];
    if (timer) clearTimeout(timer);
    saveTimersRef.current[noteId] = setTimeout(async () => {
      try {
        await persistNote(noteId, patch);
      } finally {
        delete saveTimersRef.current[noteId];
      }
    }, 450);
  };

  const upsertNote = (noteId: string, patch: Partial<StudyNote>) => {
    let changed = false;
    setNotes((prev) => prev.map((note) => {
      if (note.id !== noteId) return note;
      const hasAnyChange = Object.entries(patch).some(([key, value]) => note[key as keyof StudyNote] !== value);
      if (!hasAnyChange) return note;
      changed = true;
      return { ...note, ...patch, updatedAt: new Date().toISOString() };
    }));
    if (changed) queueSave(noteId, patch);
  };

  const handleManualSave = async (noteId: string) => {
    const timer = saveTimersRef.current[noteId];
    if (timer) {
      clearTimeout(timer);
      delete saveTimersRef.current[noteId];
    }
    await persistNote(noteId);
  };

  const stageDrawingDraft = (noteId: string, canvasData: string) => {
    drawingDraftsRef.current[noteId] = canvasData;
  };

  const flushDrawingDraft = async (noteId: string) => {
    const draft = drawingDraftsRef.current[noteId];
    if (typeof draft !== "string") return;
    delete drawingDraftsRef.current[noteId];
    setNotes((prev) => prev.map((note) => (note.id === noteId ? { ...note, drawingData: draft } : note)));
    await persistNote(noteId, { drawingData: draft });
  };

  const handleExpandedDialogOpenChange = (open: boolean) => {
    if (open) return;
    const closingId = expandedId;
    setExpandedId(null);
    if (!closingId) return;
    const closingNote = notesRef.current.find((note) => note.id === closingId);
    if (closingNote?.noteType === "drawing") {
      window.setTimeout(() => {
        void flushDrawingDraft(closingId);
      }, 80);
    }
  };

  const addNewNote = async () => {
    const lessons = getLessonsForCategory(newNoteCategory).map((item) => item.name);
    const lesson = newNoteLesson || lessons[0] || "";
    const draft = createNote(lesson, newNoteType, newNoteCategory);
    try {
      const created = await createStudyNote({
        id: draft.id,
        category: draft.category,
        lesson: draft.lesson,
        title: draft.title,
        topic: draft.topic,
        noteType: draft.noteType,
        description: draft.description,
        drawingData: draft.drawingData,
        pinned: draft.pinned,
      });
      if (newNoteCategory === category) {
        setSearchInput("");
        setActiveLesson(lesson);
        setCurrentPage(1);
        setExpandedId(created.id);
        setNotes((prev) => [created, ...prev.filter((note) => note.id !== created.id)].slice(0, notesPerPage));
        setPagination((prev) => ({
          ...prev,
          total: prev.total + 1,
          hasMore: prev.total + 1 > notesPerPage,
        }));
        setReloadSeed((value) => value + 1);
      } else {
        window.sessionStorage.setItem(getPendingOpenNoteKey(newNoteCategory), JSON.stringify({ id: created.id, lesson }));
        navigate(`/notes/${newNoteCategory.toLowerCase()}`);
      }
      setCreateDialogOpen(false);
    } catch {
      // keep dialog open
    }
  };

  const deleteNote = async (noteId: string) => {
    const timer = saveTimersRef.current[noteId];
    if (timer) {
      clearTimeout(timer);
      delete saveTimersRef.current[noteId];
    }
    delete drawingDraftsRef.current[noteId];
    setNotes((prev) => prev.filter((note) => note.id !== noteId));
    if (expandedId === noteId) setExpandedId(null);
    try {
      await deleteStudyNote(noteId);
      setPagination((prev) => ({
        ...prev,
        total: Math.max(0, prev.total - 1),
      }));
      if (notes.length === 1 && currentPage > 1) {
        setCurrentPage((prev) => Math.max(1, prev - 1));
      } else {
        setReloadSeed((value) => value + 1);
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative min-h-full w-full overflow-x-hidden px-4 py-6 text-slate-900 sm:px-6 sm:py-8 dark:text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-24 -top-20 h-72 w-72 rounded-full bg-primary/16 blur-3xl" />
        <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-accent/25 blur-3xl" />
      </div>
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="rounded-[1.6rem] border border-slate-200/80 bg-white/80 px-5 py-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.28)] backdrop-blur-xl sm:px-6 dark:border-white/10 dark:bg-slate-950/65">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-pink-500 text-white"><StickyNote className="h-5 w-5" /></div>
              <div>
                <h1 className="text-2xl font-bold sm:text-3xl">YKS Notları</h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-white/55">Ders bazlı sticky notlar, çizimli çözümler ve hızlı tekrar alanı.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/notes/tyt" className={cn("rounded-xl border px-3 py-2 text-sm", category === "TYT" ? "border-primary/60 bg-primary/15 text-primary dark:bg-primary/20 dark:text-white" : "border-slate-200 bg-white/75 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/60")}>TYT Notlar</Link>
              <Link href="/notes/ayt" className={cn("rounded-xl border px-3 py-2 text-sm", category === "AYT" ? "border-primary/60 bg-primary/15 text-primary dark:bg-primary/20 dark:text-white" : "border-slate-200 bg-white/75 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/60")}>AYT Notlar</Link>
              <div className="rounded-xl border border-slate-200 bg-white/75 px-3 py-2 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/55">{pagination.total} not</div>
              <Button onClick={() => setCreateDialogOpen(true)} className="rounded-xl gap-2 bg-gradient-to-r from-primary to-pink-500 font-semibold text-white"><Plus className="h-4 w-4" />Not Ekle</Button>
            </div>
          </div>
        </header>

        <section className="rounded-[1.4rem] border border-slate-200/80 bg-white/75 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/55">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/40" />
            <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={activeLesson ? `${activeLesson} altında not ara...` : "Not ara..."} className="rounded-xl border-slate-200 bg-white/85 pl-9 text-slate-900 placeholder:text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/35" />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {lessonTabs.map((lesson) => (
              <button key={lesson} type="button" onClick={() => setActiveLesson(lesson)} className={cn("shrink-0 rounded-xl border px-3 py-2 text-sm transition", activeLesson === lesson ? "border-primary/60 bg-primary/15 text-primary dark:bg-primary/20 dark:text-white" : "border-slate-200 bg-white/75 text-slate-600 hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/8 dark:hover:text-white")}>{lesson}</button>
            ))}
          </div>
        </section>

        <section className="rounded-[1.4rem] border border-slate-200/80 bg-white/72 p-4 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.22)] backdrop-blur-md dark:border-white/10 dark:bg-slate-950/45 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{activeLesson || "Ders"} Notları</h2>
            <span className="text-xs text-slate-500 dark:text-white/45">{pagination.total} not</span>
          </div>
          {isLoading ? <div className="rounded-2xl border border-slate-200 bg-white/80 p-8 text-center dark:border-white/10 dark:bg-white/5">Notlar yükleniyor...</div> : pagination.total === 0 ? <div className="rounded-2xl border border-slate-200 bg-white/80 p-8 text-center dark:border-white/10 dark:bg-white/5"><NotebookPen className="mx-auto h-10 w-10 text-primary/80" /><p className="mt-3 text-sm text-slate-600 dark:text-white/60">Bu ders için not yok. Yeni sticky not ekleyebilirsin.</p><Button className="mt-4 rounded-xl" onClick={() => setCreateDialogOpen(true)}>İlk Notu Ekle</Button></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{notes.map((note, idx) => <button key={note.id} type="button" onClick={() => setExpandedId(note.id)} className={cn("relative flex h-[320px] flex-col overflow-hidden rounded-[1.4rem] border p-4 text-left transition shadow-[0_18px_40px_-26px_rgba(0,0,0,0.55)] hover:-translate-y-[2px]", hashToStickyColor(note.id))} style={{ transform: `rotate(${idx % 3 === 0 ? -1.4 : idx % 3 === 1 ? 1.1 : -0.35}deg)` }}><div className="flex items-start justify-between gap-2"><div className="space-y-1"><span className="inline-flex rounded-full bg-black/8 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">{note.category}</span><p className="line-clamp-1 pr-4 text-sm font-semibold">{note.title || "Adsız Not"}</p></div>{note.pinned ? <Pin className="h-3.5 w-3.5 text-black/60" /> : null}</div><p className="mt-4 line-clamp-1 text-xs opacity-75">{note.topic || "Konu belirtilmedi"}</p>{note.noteType === "drawing" ? <DrawingPreviewCard drawingData={note.drawingData} title={note.title || "Not"} /> : <p className="mt-3 line-clamp-6 flex-1 text-[15px] leading-6 opacity-85 [font-family:'Caveat','SF_Pro_Display',cursive]">{note.description || "Not açıklaması boş."}</p>}<div className="mt-auto flex items-center justify-between pt-4 text-[11px] opacity-65"><span>{new Date(note.updatedAt).toLocaleDateString("tr-TR")}</span><span>{note.noteType === "drawing" ? "Çizim" : "Metin"}</span></div></button>)}</div>}
        </section>

        {pagination.total > 0 ? <div className="flex flex-col items-center gap-3 pb-2"><p className="text-sm text-slate-500 dark:text-white/55">{pagination.offset + 1} - {Math.min(pagination.offset + notes.length, pagination.total)} / {pagination.total} not gösteriliyor</p>{totalPages > 1 ? <Pagination><PaginationContent><PaginationItem><PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); if (safeCurrentPage > 1) setCurrentPage(safeCurrentPage - 1); }} className={safeCurrentPage <= 1 ? "pointer-events-none opacity-50" : ""} /></PaginationItem>{visiblePageNumbers.map((pageNumber) => <PaginationItem key={pageNumber}><PaginationLink href="#" isActive={pageNumber === safeCurrentPage} onClick={(e) => { e.preventDefault(); setCurrentPage(pageNumber); }}>{pageNumber}</PaginationLink></PaginationItem>)}<PaginationItem><PaginationNext href="#" onClick={(e) => { e.preventDefault(); if (safeCurrentPage < totalPages) setCurrentPage(safeCurrentPage + 1); }} className={safeCurrentPage >= totalPages ? "pointer-events-none opacity-50" : ""} /></PaginationItem></PaginationContent></Pagination> : null}</div> : null}

      </div>
      <Dialog open={!!expandedNote} onOpenChange={handleExpandedDialogOpenChange}>
        {expandedNote ? <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col overflow-hidden rounded-[1.6rem] border-slate-200 bg-white/95 p-4 text-slate-900 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/95 dark:text-white sm:p-5"><DialogHeader><DialogTitle className="text-lg font-semibold">Not Detay</DialogTitle><DialogDescription className="text-slate-500 dark:text-white/50">Not açıklaması ve çizim alanı</DialogDescription></DialogHeader><div className={cn("flex-1 space-y-3", expandedNote.noteType === "drawing" ? "overflow-hidden pr-0" : "overflow-y-auto pr-2 sm:pr-3")}><Input value={expandedNote.title} onChange={(e) => upsertNote(expandedNote.id, { title: e.target.value })} placeholder="Not başlığı" className={cn("rounded-xl", expandedNote.noteType === "text" ? "border-yellow-300/45 bg-[#fff7cf] text-slate-900 caret-slate-900 placeholder:text-slate-500" : "border-slate-200 bg-slate-50 text-slate-900 caret-slate-900 placeholder:text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white dark:caret-white dark:placeholder:text-white/35")} />{expandedNoteTopics.length > 0 ? <Select value={expandedNote.topic || "__none__"} onValueChange={(value) => upsertNote(expandedNote.id, { topic: value === "__none__" ? "" : value })}><SelectTrigger className={cn("h-11 w-full rounded-xl px-3 text-sm outline-none", expandedNote.noteType === "text" ? "border-yellow-300/45 bg-[#fff7cf] text-slate-900 focus:ring-yellow-300/40" : "border-slate-200 bg-slate-50 text-slate-900 focus:ring-primary/35 dark:border-white/10 dark:bg-white/5 dark:text-white")}><SelectValue placeholder="Konu seç" /></SelectTrigger><SelectContent className={cn(expandedNote.noteType === "text" ? "border-yellow-300/45 bg-[#fff7cf] text-slate-900" : "border-white/10 bg-slate-950 text-white")}><SelectItem value="__none__">Konu seç</SelectItem>{expandedNoteTopics.map((topic) => <SelectItem key={topic} value={topic}>{topic}</SelectItem>)}</SelectContent></Select> : <Input value={expandedNote.topic} onChange={(e) => upsertNote(expandedNote.id, { topic: e.target.value })} placeholder="Konu" className={cn("rounded-xl", expandedNote.noteType === "text" ? "border-yellow-300/45 bg-[#fff7cf] text-slate-900 caret-slate-900 placeholder:text-slate-500" : "border-slate-200 bg-slate-50 text-slate-900 caret-slate-900 placeholder:text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white dark:caret-white dark:placeholder:text-white/35")} />}{expandedNote.noteType === "text" ? <Textarea value={expandedNote.description} onChange={(e) => upsertNote(expandedNote.id, { description: e.target.value })} placeholder="Not açıklaması" className="min-h-[180px] rounded-xl border-yellow-300/45 bg-[#fff7cf] text-slate-900 caret-slate-900 placeholder:text-slate-500" /> : null}{expandedNote.noteType === "drawing" ? <div className="mt-3 flex justify-center"><div className="w-full max-w-[720px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100/80 shadow-inner dark:border-white/10 dark:bg-black/20"><DrawingCanvas key={expandedNote.id} questionId={noteCanvasId(expandedNote.id)} noSave defaultMode="separate" overlayChrome initialData={expandedNote.drawingData ?? undefined} onTempSave={(canvasData) => stageDrawingDraft(expandedNote.id, canvasData)} onClose={() => setExpandedId(null)} /></div></div> : null}</div><div className="mt-3 grid gap-2 border-t border-slate-200/80 pt-3 dark:border-white/10 sm:grid-cols-4"><Button className="rounded-xl bg-gradient-to-r from-primary to-pink-500 text-white" onClick={() => handleManualSave(expandedNote.id)} disabled={savingNoteIds[expandedNote.id] === true}>{savingNoteIds[expandedNote.id] ? "Kaydediliyor..." : recentlySavedNoteId === expandedNote.id ? "Kaydedildi" : "Kaydet"}</Button><Button variant="outline" className="rounded-xl border-slate-200 bg-white/80 text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white" onClick={() => upsertNote(expandedNote.id, { pinned: !expandedNote.pinned })}>{expandedNote.pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}{expandedNote.pinned ? "Sabitlemeyi Kaldır" : "Sabitle"}</Button><Button variant="destructive" className="rounded-xl" onClick={() => deleteNote(expandedNote.id)}><Trash2 className="mr-2 h-4 w-4" />Notu Sil</Button><div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-white/50"><p className="flex items-center gap-2 text-slate-900 dark:text-white"><CalendarClock className="h-4 w-4 text-primary" />Son güncelleme</p><p className="mt-1">{formatUpdatedAt(expandedNote.updatedAt)}</p></div></div></DialogContent> : null}
      </Dialog>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md rounded-[1.6rem] border-slate-200 bg-white/95 p-5 text-slate-900 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/95 dark:text-white">
          <DialogHeader><DialogTitle className="text-lg font-semibold">Not Ekle</DialogTitle><DialogDescription className="text-slate-500 dark:text-white/50">Yeni notu hangi dersin altına eklemek istediğini seç.</DialogDescription></DialogHeader>
          <div className="space-y-4"><div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/70">Seçili hedef: <span className="font-medium text-slate-900 dark:text-white">{newNoteCategory} / {newNoteLesson || "-"}</span></div><div className="space-y-2"><p className="text-sm font-medium">Kategori</p><div className="grid grid-cols-2 gap-2">{(["TYT", "AYT"] as NoteCategory[]).map((item) => <button key={item} type="button" onClick={() => setNewNoteCategory(item)} className={cn("rounded-xl border px-3 py-3 text-sm transition", newNoteCategory === item ? "border-primary/60 bg-primary/15 text-primary dark:bg-primary/20 dark:text-white" : "border-slate-200 bg-white/75 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/60")}>{item}</button>)}</div></div><div className="space-y-2"><p className="text-sm font-medium">Ders</p><div className="flex flex-wrap gap-2">{getLessonsForCategory(newNoteCategory).map((item) => <button key={item.name} type="button" onClick={() => setNewNoteLesson(item.name)} className={cn("rounded-xl border px-3 py-2 text-sm transition", newNoteLesson === item.name ? "border-primary/60 bg-primary/15 text-primary dark:bg-primary/20 dark:text-white" : "border-slate-200 bg-white/75 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/60")}>{item.name}</button>)}</div></div><div className="space-y-2"><p className="text-sm font-medium">Not tipi</p><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setNewNoteType("text")} className={cn("rounded-xl border px-3 py-3 text-sm transition", newNoteType === "text" ? "border-primary/60 bg-primary/15 text-primary dark:bg-primary/20 dark:text-white" : "border-slate-200 bg-white/75 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/60")}>Sadece Metin</button><button type="button" onClick={() => setNewNoteType("drawing")} className={cn("rounded-xl border px-3 py-3 text-sm transition", newNoteType === "drawing" ? "border-primary/60 bg-primary/15 text-primary dark:bg-primary/20 dark:text-white" : "border-slate-200 bg-white/75 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/60")}>Çizimli Not</button></div></div><div className="flex gap-2"><Button type="button" variant="outline" className="flex-1 rounded-xl border-slate-200 bg-white/80 text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white" onClick={() => setCreateDialogOpen(false)}>Vazgeç</Button><Button type="button" className="flex-1 rounded-xl bg-gradient-to-r from-primary to-pink-500 text-white" onClick={addNewNote}>Notu Oluştur</Button></div></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}




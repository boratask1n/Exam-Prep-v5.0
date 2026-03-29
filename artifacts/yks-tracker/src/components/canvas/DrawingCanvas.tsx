import React, { useEffect, useRef, useState, useCallback } from "react";
import { Pen, Eraser, Trash2, Undo2, Save, ChevronDown, ChevronUp, ImageIcon, PenLine, ZoomIn, ZoomOut, Maximize2, PencilLine, Brush, Feather } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useSaveDrawing } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Pt {
  x: number;
  y: number;
  pressure: number;
}

/** 1–100 UI scale → canvas px (paper space) */
export type PenKind = "ballpoint" | "fountain" | "pencil" | "brush";

interface Stroke {
  tool: "pen" | "eraser";
  color: string;
  /** Kalem/silgi kalınlığı: 1–100 (Samsung Notes tarzı) */
  width: number;
  points: Pt[];
  /** Sadece kalem; eski kayıtlarda yok → tükenmez */
  penKind?: PenKind;
}
type EraserMode = "area" | "stroke";


export interface DrawingCanvasProps {
  questionId: number;
  imageUrl?: string | null;
  initialData?: string;
  onClose?: () => void;
  noSave?: boolean;
  onTempSave?: (canvasData: string) => void;
  defaultMode?: "overlay" | "separate";
}

// ─── Constants ────────────────────────────────────────────────────────────────
const COLORS = [
  { hex: "#3b82f6", name: "Mavi" },
  { hex: "#ef4444", name: "Kırmızı" },
  { hex: "#22c55e", name: "Yeşil" },
  { hex: "#f59e0b", name: "Turuncu" },
  { hex: "#8b5cf6", name: "Mor" },
  { hex: "#ffffff", name: "Beyaz" },
  { hex: "#000000", name: "Siyah" },
];

const PEN_KIND_OPTIONS: { id: PenKind; label: string; short: string }[] = [
  { id: "ballpoint", label: "Tükenmez kalem", short: "Tükenmez" },
  { id: "fountain", label: "Dolma kalem", short: "Dolma" },
  { id: "pencil", label: "Kurşun kalem", short: "Kurşun" },
  { id: "brush", label: "Fırça", short: "Fırça" },
];

// Fixed paper dimensions — same on every device so drawings stay in sync
const PAPER_W = 2000;
const PAPER_H = 2000;
/** Horizontal inset for the question image — larger = more side margin for drawing beside the image */
const IMG_SIDE_PAD = 60; // paper units (was 56)
const IMG_TOP_PAD =20; // paper units
/** Max image height on paper — keeps photos from dominating on wide / auto-fit zoom */
const IMG_MAX_HEIGHT = 620; // paper units (biraz küçültüldü)
/** Never auto-zoom above 1.0 so large monitors don’t blow up the whole page */
const MAX_FIT_ZOOM = 1.0;

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4.0;

/** 1–100 → kalem çizgi kalınlığı (paper birimi) */
function penScaleToPx(scale: number): number {
  const s = Math.min(100, Math.max(1, scale));
  return 0.35 + (s / 100) * 39.65;
}

/** 1–100 → silgi “genişliği” (eski 10–34 piksel aralığına yakın, çizgi silgi için) */
function eraserScaleToWidth(scale: number): number {
  const s = Math.min(100, Math.max(1, scale));
  return 4 + (s / 100) * 30;
}

/** Tablet basıncını daha doğal hissettirmek için eğri (0.5–1 aralığı) */
function curvePressure(raw: number): number {
  const p = Math.min(1, Math.max(0.05, raw));
  return Math.pow(p, 0.62);
}

function mixHex(a: string, b: string, t: number): string {
  const p = (x: string) => parseInt(x, 16);
  const ah = a.replace("#", "");
  const bh = b.replace("#", "");
  const ar = p(ah.slice(0, 2));
  const ag = p(ah.slice(2, 4));
  const ab = p(ah.slice(4, 6));
  const br = p(bh.slice(0, 2));
  const bg = p(bh.slice(2, 4));
  const bb = p(bh.slice(4, 6));
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const b_ = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, b_].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/** Eski kayıtlardaki piksel kalınlıklarını 1–100 ölçeğe taşır */
function normalizeStrokeForLoad(s: Stroke): Stroke {
  const kind: PenKind = s.penKind ?? "ballpoint";
  if (s.tool === "eraser") {
    const w = s.width;
    if (w <= 40 && Number.isInteger(w) && [10, 16, 24, 34].includes(w)) {
      const map: Record<number, number> = { 10: 12, 16: 22, 24: 38, 34: 58 };
      return { ...s, width: map[w] };
    }
    if (w > 0 && w <= 100) return { ...s, width: w };
    return { ...s, width: Math.min(100, Math.max(1, Math.round((w / 80) * 100))) };
  }
  const w = s.width;
  if (w <= 16 && Number.isInteger(w) && [2, 4, 7, 12].includes(w)) {
    const map: Record<number, number> = { 2: 18, 4: 35, 7: 55, 12: 85 };
    return { ...s, width: map[w], penKind: kind };
  }
  if (w > 0 && w <= 100) return { ...s, penKind: kind };
  return { ...s, width: Math.min(100, Math.max(1, Math.round(w))), penKind: kind };
}

// ─── Render helpers ───────────────────────────────────────────────────────────
function segmentWidthPx(
  stroke: Stroke,
  pressureAvg: number,
  _pressureEnd: number,
): number {
  if (stroke.tool === "eraser") {
    const base = eraserScaleToWidth(stroke.width);
    return Math.max(1.5, base * pressureAvg);
  }
  const base = penScaleToPx(stroke.width);
  const kind = stroke.penKind ?? "ballpoint";
  switch (kind) {
    case "brush":
      return Math.max(0.5, base * (0.45 + 0.85 * pressureAvg));
    case "ballpoint":
    default:
      return Math.max(0.5, base * (0.88 + 0.24 * pressureAvg));
  }
}

function strokeStyleForPen(stroke: Stroke): string {
  if (stroke.tool === "eraser") return "rgba(0,0,0,1)";
  const kind = stroke.penKind ?? "ballpoint";
  const c = stroke.color;
  if (kind === "pencil") return mixHex(c, "#9ca3af", 0.22);
  return c;
}

/** Deterministic “grain” — çizgi indeksine göre tekrarlanabilir gürültü */
function grain01(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 43758.5453) * 43758.5453;
  return x - Math.floor(x);
}

/** Dolma kalem: hız arttıkça çizgi incelir, yavaşlayınca kalınlaşır */
function renderStrokeFountain(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const pts = stroke.points;
  const base = penScaleToPx(stroke.width);
  const col = strokeStyleForPen(stroke);
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.96;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const velocity = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const pr = (p0.pressure + p1.pressure) / 2;
    const dynamicWidth = (base * pr) / (1 + velocity * 0.11);
    ctx.lineWidth = Math.max(0.65, dynamicWidth);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
}

/** Kurşun kalem: düşük opaklık, hafif gölge, segment başına grain */
function renderStrokePencil(ctx: CanvasRenderingContext2D, stroke: Stroke, strokeSalt: number) {
  const pts = stroke.points;
  const base = penScaleToPx(stroke.width) * 0.92;
  const col = strokeStyleForPen(stroke);
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const pr = (p0.pressure + p1.pressure) / 2;
    const n = grain01(i, strokeSalt);
    const n2 = grain01(i + 17, strokeSalt + 1);
    const ox = (n - 0.5) * 1.1;
    const oy = (n2 - 0.5) * 1.1;
    const w = Math.max(0.35, base * (0.55 + 0.45 * pr));

    ctx.save();
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.22 + 0.42 * pr;
    ctx.lineWidth = w;
    ctx.shadowBlur = 1.2;
    ctx.shadowColor = col;
    ctx.beginPath();
    ctx.moveTo(p0.x + ox, p0.y + oy);
    ctx.lineTo(p1.x + ox, p1.y + oy);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.12 + 0.2 * pr;
    ctx.lineWidth = w * 0.45;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = mixHex(col, "#ffffff", 0.15);
    ctx.beginPath();
    ctx.moveTo(p0.x - ox * 0.4, p0.y - oy * 0.4);
    ctx.lineTo(p1.x - ox * 0.4, p1.y - oy * 0.4);
    ctx.stroke();
    ctx.restore();
  }
}

/** Tükenmez / fırça / silgi: yumuşak quadratic eğriler */
function renderStrokeSmooth(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const pts = stroke.points;
  if (pts.length === 0) return;

  // Tek nokta (ör. tek dokunuş silgi) — aşağıdaki prev/last segmenti pts[-2] gerektirir
  if (pts.length === 1) {
    const p = pts[0];
    const w = segmentWidthPx(stroke, p.pressure, p.pressure);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, w / 2), 0, Math.PI * 2);
    ctx.fillStyle = stroke.tool === "eraser" ? "rgba(0,0,0,1)" : strokeStyleForPen(stroke);
    ctx.globalAlpha = 1;
    ctx.fill();
    return;
  }

  const kind = stroke.penKind ?? "ballpoint";

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const pressureAvg = (p0.pressure + p1.pressure) / 2;
    const w = segmentWidthPx(stroke, pressureAvg, p1.pressure);

    ctx.beginPath();
    ctx.lineWidth = w;
    ctx.strokeStyle = stroke.tool === "eraser" ? "rgba(0,0,0,1)" : strokeStyleForPen(stroke);
    ctx.globalAlpha = 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (i === 0) {
      ctx.moveTo(p0.x, p0.y);
    } else {
      ctx.moveTo((pts[i - 1].x + p0.x) / 2, (pts[i - 1].y + p0.y) / 2);
    }
    ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
    ctx.stroke();

    if (kind === "brush" && stroke.tool === "pen") {
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = w * 1.28;
      ctx.strokeStyle = stroke.color;
      ctx.beginPath();
      if (i === 0) {
        ctx.moveTo(p0.x, p0.y);
      } else {
        ctx.moveTo((pts[i - 1].x + p0.x) / 2, (pts[i - 1].y + p0.y) / 2);
      }
      ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  if (!last || !prev) return;

  const wLast = segmentWidthPx(stroke, last.pressure, last.pressure);
  ctx.beginPath();
  ctx.lineWidth = wLast;
  ctx.strokeStyle = stroke.tool === "eraser" ? "rgba(0,0,0,1)" : strokeStyleForPen(stroke);
  ctx.globalAlpha = 1;
  ctx.moveTo((prev.x + last.x) / 2, (prev.y + last.y) / 2);
  ctx.lineTo(last.x, last.y);
  ctx.stroke();

  if (kind === "brush" && stroke.tool === "pen") {
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = wLast * 1.28;
    ctx.strokeStyle = stroke.color;
    ctx.beginPath();
    ctx.moveTo((prev.x + last.x) / 2, (prev.y + last.y) / 2);
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.restore();
  }
}

function renderStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const pts = stroke.points;
  if (pts.length === 0) return;

  ctx.save();
  ctx.globalCompositeOperation =
    stroke.tool === "eraser" ? "destination-out" : "source-over";

  const kind = stroke.penKind ?? "ballpoint";

  if (stroke.tool === "eraser") {
    renderStrokeSmooth(ctx, stroke);
    ctx.restore();
    return;
  }

  if (pts.length === 1) {
    const pr = pts[0].pressure;
    if (kind === "fountain") {
      const base = penScaleToPx(stroke.width);
      const w = Math.max(0.65, base * pr);
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, w / 2, 0, Math.PI * 2);
      ctx.fillStyle = strokeStyleForPen(stroke);
      ctx.globalAlpha = 0.96;
      ctx.fill();
    } else if (kind === "pencil") {
      const base = penScaleToPx(stroke.width) * 0.92;
      const w = Math.max(0.35, base * pr);
      ctx.fillStyle = strokeStyleForPen(stroke);
      ctx.globalAlpha = 0.35 + 0.45 * pr;
      ctx.shadowBlur = 1;
      ctx.shadowColor = stroke.color;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, w / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const w = segmentWidthPx(stroke, pr, pr);
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, Math.max(0.5, w / 2), 0, Math.PI * 2);
      ctx.fillStyle = strokeStyleForPen(stroke);
      ctx.globalAlpha = 1;
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (kind === "fountain") {
    renderStrokeFountain(ctx, stroke);
    ctx.restore();
    return;
  }

  if (kind === "pencil") {
    const salt =
      pts.reduce((acc, p) => acc + p.x * 0.001 + p.y * 0.001, 0) % 1000;
    renderStrokePencil(ctx, stroke, salt);
    ctx.restore();
    return;
  }

  renderStrokeSmooth(ctx, stroke);
  ctx.restore();
}

function eraseStrokesByPath(strokes: Stroke[], eraserPath: Pt[], radius: number): Stroke[] {
  if (!eraserPath.length || radius <= 0) return strokes;
  const hit = (a: Pt, b: Pt) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy <= radius * radius;
  };
  return strokes.filter((stroke) => {
    if (stroke.tool === "eraser") return true;
    for (const sp of stroke.points)
      for (const ep of eraserPath)
        if (hit(sp, ep)) return false;
    return true;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
export function DrawingCanvas({
  questionId,
  imageUrl,
  initialData,
  onClose,
  noSave = false,
  onTempSave,
  defaultMode,
}: DrawingCanvasProps) {
  const [mode, setMode] = useState<"overlay" | "separate">(
    defaultMode ?? (imageUrl ? "overlay" : "separate")
  );
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Canvas & refs — overlay uses two stacked layers so eraser (destination-out) never punches through paper/image
  const overlayBaseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayStrokeCanvasRef = useRef<HTMLCanvasElement>(null);
  const boardCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null); // separate mode board container
  const scrollViewRef = useRef<HTMLDivElement>(null); // overlay mode scroll container
  const imgRef = useRef<HTMLImageElement>(null);

  // Overlay zoom — stored in ref for handlers, in state to trigger re-renders
  const [zoom, setZoom] = useState(1.0);
  const zoomRef = useRef(1.0);
  zoomRef.current = zoom;

  const [imgLoaded, setImgLoaded] = useState(false);
  const imgLoadedRef = useRef(false);
  imgLoadedRef.current = imgLoaded;

  // Image layout in PAPER coordinates (constant across devices)
  const imgLayoutRef = useRef({ x: 0, y: IMG_TOP_PAD, w: 0, h: 0 });

  // DPR
  const dprRef = useRef(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

  // Separate mode state
  const [separateImageScale, setSeparateImageScale] = useState(1.0);
  const [separateImagePanelPct, setSeparateImagePanelPct] = useState(52);
  const [isResizingSplit, setIsResizingSplit] = useState(false);
  const splitWrapRef = useRef<HTMLDivElement>(null);

  // Tools
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState(COLORS[0].hex);
  const [penKind, setPenKind] = useState<PenKind>("ballpoint");
  /** 1–100 kalem kalınlığı */
  const [penWidth, setPenWidth] = useState(35);
  /** 1–100 silgi kalınlığı */
  const [eraserWidth, setEraserWidth] = useState(35);
  const [eraserMode, setEraserMode] = useState<EraserMode>("area");

  // Strokes
  const [overlayStrokes, setOverlayStrokes] = useState<Stroke[]>([]);
  const [boardStrokes, setBoardStrokes] = useState<Stroke[]>([]);
  const overlayStrokesRef = useRef<Stroke[]>([]);
  const boardStrokesRef = useRef<Stroke[]>([]);
  overlayStrokesRef.current = overlayStrokes;
  boardStrokesRef.current = boardStrokes;

  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const currentStrokeRef = useRef<Stroke | null>(null);
  currentStrokeRef.current = currentStroke;

  const [isSaving, setIsSaving] = useState(false);
  const [showPanel, setShowPanel] = useState(true);

  // cursorPos: in PAPER coords for overlay mode, screen-relative for separate mode
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [cursorInCanvas, setCursorInCanvas] = useState(false);
  const [undoHistory, setUndoHistory] = useState<Stroke[][]>([]);

  /** Sadece resim üstü (overlay) değişince kayıt uyarısı — ayrı tahta müsvedde, kaydedilmez */
  const overlayDirtyRef = useRef(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const saveDrawingMutation = useSaveDrawing();
  const queryClient = useQueryClient();
  const { theme, systemTheme } = useTheme();
  const currentTheme = theme === "system" ? systemTheme : theme;

  const activeStrokes = mode === "overlay" ? overlayStrokes : boardStrokes;
  const activeStrokesRef = mode === "overlay" ? overlayStrokesRef : boardStrokesRef;

  const setActiveStrokes = useCallback(
    (updater: Stroke[] | ((prev: Stroke[]) => Stroke[])) => {
      if (modeRef.current === "overlay") setOverlayStrokes(updater as any);
      else setBoardStrokes(updater as any);
    },
    []
  );

  // ── Load initial data (does NOT mark dirty) — sadece overlay kalıcı; ayrı tahta her zaman boş (müsvedde) ──
  useEffect(() => {
    if (!initialData) return;
    try {
      const parsed = JSON.parse(initialData);
      if (Array.isArray(parsed)) {
        setOverlayStrokes(parsed.map((s) => normalizeStrokeForLoad(s as Stroke)));
      } else if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.overlay))
          setOverlayStrokes(parsed.overlay.map((s: Stroke) => normalizeStrokeForLoad(s)));
      }
    } catch {}
    setBoardStrokes([]);
    overlayDirtyRef.current = false;
  }, []);

  // ─────────────────────────────────────────────────────────────────
  // OVERLAY: compute image layout in PAPER coordinates (device-independent)
  // ─────────────────────────────────────────────────────────────────
  const updateImgLayout = useCallback(() => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;

    const maxW = PAPER_W - IMG_SIDE_PAD * 2;
    const maxH = IMG_MAX_HEIGHT;
    const scaleW = maxW / img.naturalWidth;
    const scaleH = maxH / img.naturalHeight;
    const scale = Math.min(1, scaleW, scaleH);

    const imgW = img.naturalWidth * scale;
    const imgH = img.naturalHeight * scale;
    const imgX = (PAPER_W - imgW) / 2;

    imgLayoutRef.current = { x: imgX, y: IMG_TOP_PAD, w: imgW, h: imgH };
  }, []);

  // ─────────────────────────────────────────────────────────────────
  // OVERLAY: Base layer (paper + image) + stroke layer (ink + eraser). Eraser only clears the stroke layer.
  // ─────────────────────────────────────────────────────────────────
  const renderOverlay = useCallback(() => {
    const base = overlayBaseCanvasRef.current;
    const strokeLayer = overlayStrokeCanvasRef.current;
    if (!base || !strokeLayer || modeRef.current !== "overlay") return;
    const dpr = dprRef.current;
    const z = zoomRef.current;

    const physW = Math.round(PAPER_W * z * dpr);
    const physH = Math.round(PAPER_H * z * dpr);
    const sizeCanvas = (canvas: HTMLCanvasElement) => {
      if (canvas.width !== physW || canvas.height !== physH) {
        canvas.width = physW;
        canvas.height = physH;
      }
      canvas.style.width = `${PAPER_W * z}px`;
      canvas.style.height = `${PAPER_H * z}px`;
    };
    sizeCanvas(base);
    sizeCanvas(strokeLayer);

    const ctxBase = base.getContext("2d")!;
    ctxBase.setTransform(z * dpr, 0, 0, z * dpr, 0, 0);
    ctxBase.clearRect(0, 0, PAPER_W, PAPER_H);

    ctxBase.fillStyle = currentTheme === "dark" ? "#0f0f1a" : "#e8eaf0";
    ctxBase.fillRect(0, 0, PAPER_W, PAPER_H);

    const { x: imgX, y: imgY, w: imgW, h: imgH } = imgLayoutRef.current;

    if (imgRef.current && imgLoadedRef.current && imgW > 0) {
      ctxBase.save();
      ctxBase.shadowColor = "rgba(0,0,0,0.25)";
      ctxBase.shadowBlur = 12;
      ctxBase.fillStyle = "#ffffff";
      ctxBase.fillRect(imgX, imgY, imgW, imgH);
      ctxBase.restore();

      ctxBase.drawImage(imgRef.current, imgX, imgY, imgW, imgH);

      ctxBase.save();
      ctxBase.globalAlpha = 0.18;
      ctxBase.strokeStyle = "#64748b";
      ctxBase.lineWidth = 1;
      ctxBase.strokeRect(imgX, imgY, imgW, imgH);
      ctxBase.restore();
    } else if (!imageUrl) {
      ctxBase.fillStyle = "#ffffff";
      ctxBase.fillRect(0, 0, PAPER_W, PAPER_H);
    }

    const ctxStroke = strokeLayer.getContext("2d")!;
    ctxStroke.setTransform(z * dpr, 0, 0, z * dpr, 0, 0);
    ctxStroke.clearRect(0, 0, PAPER_W, PAPER_H);
    for (const s of overlayStrokesRef.current) renderStroke(ctxStroke, s);
    const cs = currentStrokeRef.current;
    if (cs) renderStroke(ctxStroke, cs);
  }, [currentTheme, imageUrl]);

  // ── Compute fit zoom (fit paper width into viewport, cap so huge screens stay readable) ──
  const computeFitZoom = useCallback(() => {
    const sv = scrollViewRef.current;
    if (!sv) return 1;
    const widthFit = sv.clientWidth / PAPER_W;
    const z = Math.min(widthFit, MAX_FIT_ZOOM);
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
  }, []);

  // ── Apply a new zoom, keeping the scroll center stable ──
  const applyZoom = useCallback((newZoom: number, anchorCssX?: number, anchorCssY?: number) => {
    const sv = scrollViewRef.current;
    if (!sv) return;
    const oldZoom = zoomRef.current;
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    if (Math.abs(clamped - oldZoom) < 0.001) return;

    // Default anchor: center of the visible viewport
    const ax = anchorCssX ?? sv.clientWidth / 2;
    const ay = anchorCssY ?? sv.clientHeight / 2;

    // Paper coordinate under anchor
    const paperX = (sv.scrollLeft + ax) / oldZoom;
    const paperY = (sv.scrollTop + ay) / oldZoom;

    zoomRef.current = clamped;
    setZoom(clamped);

    requestAnimationFrame(() => {
      if (!scrollViewRef.current) return;
      scrollViewRef.current.scrollLeft = paperX * clamped - ax;
      scrollViewRef.current.scrollTop = paperY * clamped - ay;
      renderOverlay();
    });
  }, [renderOverlay]);

  // ── Setup overlay canvas: initial zoom + respond to resize ──
  useEffect(() => {
    if (mode !== "overlay") return;
    const sv = scrollViewRef.current;
    if (!sv) return;

    const init = () => {
      dprRef.current = window.devicePixelRatio || 1;
      updateImgLayout();
      // On first render, fit the paper width to the viewport
      const fit = computeFitZoom();
      zoomRef.current = fit;
      setZoom(fit);
      renderOverlay();
    };

    const ro = new ResizeObserver(() => {
      dprRef.current = window.devicePixelRatio || 1;
      renderOverlay();
    });
    ro.observe(sv);
    init();
    return () => ro.disconnect();
  }, [mode, updateImgLayout, renderOverlay, computeFitZoom]);

  // ── Reset zoom to fit when leaving / re-entering overlay mode ──
  useEffect(() => {
    if (mode !== "overlay") {
      zoomRef.current = 1;
      setZoom(1);
    }
  }, [mode]);

  // ── Ctrl/Cmd + wheel zoom for overlay mode ──
  useEffect(() => {
    if (mode !== "overlay") return;
    const sv = scrollViewRef.current;
    if (!sv) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = sv.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.003);
      applyZoom(zoomRef.current * factor, cssX, cssY);
    };
    sv.addEventListener("wheel", onWheel, { passive: false });
    return () => sv.removeEventListener("wheel", onWheel);
  }, [mode, applyZoom]);

  // ── Re-render on stroke / theme / zoom changes ──
  useEffect(() => {
    if (mode === "overlay") renderOverlay();
  }, [overlayStrokes, currentStroke, mode, imgLoaded, renderOverlay, zoom]);

  // ── Separate mode canvas resize ──
  useEffect(() => {
    if (mode !== "separate") return;
    const container = containerRef.current;
    const canvas = boardCanvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      for (const s of boardStrokesRef.current) renderStroke(ctx, s);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [mode]);

  // ── Redraw separate mode on stroke change ──
  useEffect(() => {
    if (mode !== "separate") return;
    const canvas = boardCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    for (const s of boardStrokes) renderStroke(ctx, s);
    if (currentStroke) renderStroke(ctx, currentStroke);
  }, [mode, boardStrokes, currentStroke]);

  // ─────────────────────────────────────────────────────────────────
  // INPUT: Coordinate mapping → paper coordinates
  // getBoundingClientRect() of the canvas already accounts for scroll offset
  // so (clientX - rect.left) / zoom gives correct paper X on all devices.
  // ─────────────────────────────────────────────────────────────────
  const getXY = useCallback((e: React.PointerEvent): Pt => {
    const canvas =
      modeRef.current === "overlay"
        ? overlayStrokeCanvasRef.current
        : boardCanvasRef.current;
    if (!canvas)
      return {
        x: 0,
        y: 0,
        pressure: curvePressure(e.pressure > 0 ? e.pressure : 0.5),
      };
    const rect = canvas.getBoundingClientRect();
    const rawP = e.pressure > 0 ? e.pressure : 0.5;
    const pressure = curvePressure(rawP);
    if (modeRef.current === "overlay") {
      const z = zoomRef.current;
      return {
        x: (e.clientX - rect.left) / z,
        y: (e.clientY - rect.top) / z,
        pressure,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        pressure,
      };
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────
  // POINTER EVENT HANDLERS
  // ─────────────────────────────────────────────────────────────────
  const isDrawingRef = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const isHardwareEraser = e.button === 5 || (e.buttons & 32) === 32;
    // Tablet (Veikk vb.): uç silgi ↔ kalem durumunu araç çubuğuyla eşitle
    if (e.pointerType === "pen") {
      if (isHardwareEraser) setTool("eraser");
      else setTool("pen");
    } else if (isHardwareEraser) {
      setTool("eraser");
    }
    const activeTool: "pen" | "eraser" = isHardwareEraser
      ? "eraser"
      : e.pointerType === "pen"
        ? "pen"
        : tool;

    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    isDrawingRef.current = true;

    const pt = getXY(e);
    const stroke: Stroke = {
      tool: activeTool,
      color: activeTool === "eraser" ? "#000000" : color,
      width: activeTool === "eraser" ? eraserWidth : penWidth,
      points: [pt],
      ...(activeTool === "pen" ? { penKind } : {}),
    };
    setCurrentStroke(stroke);
    currentStrokeRef.current = stroke;
  }, [getXY, color, penWidth, eraserWidth, tool, penKind]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const isHardwareEraser = e.button === 5 || (e.buttons & 32) === 32;
    if (e.pointerType === "pen") {
      if (isHardwareEraser) setTool("eraser");
      else setTool("pen");
    } else if (isHardwareEraser) {
      setTool("eraser");
    }

    if (e.buttons === 0) return;
    e.preventDefault();
    if (!currentStrokeRef.current) return;

    const pt = getXY(e);
    setCurrentStroke((prev) => {
      if (!prev) return prev;
      const last = prev.points[prev.points.length - 1];
      if (Math.hypot(pt.x - last.x, pt.y - last.y) < 0.5) return prev;
      const updated = { ...prev, points: [...prev.points, pt] };
      currentStrokeRef.current = updated;

      if (modeRef.current === "separate") {
        const canvas = boardCanvasRef.current;
        if (canvas && (prev.tool === "pen" || (prev.tool === "eraser" && eraserMode === "area"))) {
          const ctx = canvas.getContext("2d")!;
          const dpr = window.devicePixelRatio || 1;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          renderStroke(ctx, { ...prev, points: [last, pt] });
        }
      }
      return updated;
    });
  }, [getXY, eraserMode]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDrawingRef.current = false;
    setCurrentStroke((prev) => {
      if (!prev) return prev;
      if (modeRef.current === "overlay") overlayDirtyRef.current = true;
      const isStrokeEraser = prev.tool === "eraser" && eraserMode === "stroke";
      if (isStrokeEraser) {
        const radius = Math.max(6, eraserScaleToWidth(prev.width) / 2);
        if (modeRef.current === "overlay") setOverlayStrokes((s) => eraseStrokesByPath(s, prev.points, radius));
        else setBoardStrokes((s) => eraseStrokesByPath(s, prev.points, radius));
      } else {
        if (modeRef.current === "overlay") setOverlayStrokes((s) => [...s, prev]);
        else setBoardStrokes((s) => [...s, prev]);
      }
      currentStrokeRef.current = null;
      return null;
    });
  }, [eraserMode]);

  const pointerHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };

  // Özel imleç: küçük kağıt div'inde pointerleave titremesi yerine global pointermove + rect (tolerans)
  useEffect(() => {
    const EDGE_PAD = 8;

    const syncCursor = (e: PointerEvent) => {
      if (modeRef.current === "overlay") {
        const canvas = overlayStrokeCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const inBounds =
          e.clientX >= rect.left - EDGE_PAD &&
          e.clientX <= rect.right + EDGE_PAD &&
          e.clientY >= rect.top - EDGE_PAD &&
          e.clientY <= rect.bottom + EDGE_PAD;
        if (!inBounds) {
          setCursorInCanvas(false);
          setCursorPos(null);
          return;
        }
        setCursorInCanvas(true);
        const z = zoomRef.current;
        setCursorPos({
          x: (e.clientX - rect.left) / z,
          y: (e.clientY - rect.top) / z,
        });
        return;
      }

      const canvas = boardCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const inBounds =
        e.clientX >= rect.left - EDGE_PAD &&
        e.clientX <= rect.right + EDGE_PAD &&
        e.clientY >= rect.top - EDGE_PAD &&
        e.clientY <= rect.bottom + EDGE_PAD;
      if (!inBounds) {
        setCursorInCanvas(false);
        setCursorPos(null);
        return;
      }
      setCursorInCanvas(true);
      setCursorPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };

    window.addEventListener("pointermove", syncCursor, { passive: true });
    return () => window.removeEventListener("pointermove", syncCursor);
  }, []);

  // ─────────────────────────────────────────────────────────────────
  // Keyboard shortcuts
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (modeRef.current === "overlay") {
          overlayDirtyRef.current = true;
          setOverlayStrokes((p) => p.slice(0, -1));
        } else setBoardStrokes((p) => p.slice(0, -1));
      }
      // Ctrl/Cmd + = or + for zoom in
      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        applyZoom(zoomRef.current * 1.2);
      }
      // Ctrl/Cmd + - for zoom out
      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        applyZoom(zoomRef.current / 1.2);
      }
      // Ctrl/Cmd + 0 to fit
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        applyZoom(computeFitZoom());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyZoom, computeFitZoom]);

  // ── Split panel resize ──
  useEffect(() => {
    if (!isResizingSplit) return;
    const onMouseMove = (e: MouseEvent) => {
      const wrap = splitWrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSeparateImagePanelPct(Math.max(26, Math.min(74, pct)));
    };
    const onMouseUp = () => setIsResizingSplit(false);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizingSplit]);

  // ── DB Save (yalnızca overlay) ──
  const handleClose = useCallback(() => {
    if (overlayDirtyRef.current && !noSave) {
      setShowSaveDialog(true);
    } else {
      if (noSave && onTempSave) {
        onTempSave(JSON.stringify({ overlay: overlayStrokesRef.current }));
      }
      onClose?.();
    }
  }, [noSave, onClose, onTempSave]);

  const handleDbSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await saveDrawingMutation.mutateAsync({
        id: questionId,
        data: { canvasData: JSON.stringify({ overlay: overlayStrokesRef.current }) },
      });
      queryClient.removeQueries({ queryKey: [`/api/questions/${questionId}/drawing`] });
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      overlayDirtyRef.current = false;
    } finally {
      setIsSaving(false);
      onClose?.();
    }
  }, [questionId, saveDrawingMutation, queryClient, onClose]);

  const handleSaveAndClose = useCallback(async () => {
    await handleDbSave();
    setShowSaveDialog(false);
  }, [handleDbSave]);

  const handleDiscardAndClose = useCallback(() => {
    overlayDirtyRef.current = false;
    setShowSaveDialog(false);
    onClose?.();
  }, [onClose]);

  // ── Custom cursors (paper coords in overlay → multiply by zoom for CSS px) ──
  const penCursorPx = Math.max(
    4,
    Math.min(
      (mode === "overlay" ? penScaleToPx(penWidth) * zoom : penScaleToPx(penWidth)) * 1.1,
      120,
    ),
  );

  const DotCursor = tool === "pen" && cursorInCanvas && cursorPos && !currentStroke ? (
    <div
      className="absolute pointer-events-none z-[55] rounded-full"
      style={{
        left: mode === "overlay" ? cursorPos.x * zoom : cursorPos.x,
        top: mode === "overlay" ? cursorPos.y * zoom : cursorPos.y,
        width: penCursorPx,
        height: penCursorPx,
        transform: "translate(-50%, -50%)",
        backgroundColor: color,
        boxShadow: "0 0 0 1px rgba(255,255,255,0.5), 0 0 0 2px rgba(0,0,0,0.3)",
      }}
    />
  ) : null;

  const eraserRingPx =
    mode === "overlay"
      ? Math.max(10, Math.min(eraserScaleToWidth(eraserWidth) * zoom, 160))
      : Math.max(10, Math.min(eraserScaleToWidth(eraserWidth), 160));

  const EraserCursor = tool === "eraser" && cursorInCanvas && cursorPos && !currentStroke ? (
    <div
      className="absolute pointer-events-none z-[55] rounded-full border-[2.5px] border-orange-400 bg-orange-400/15"
      style={{
        left: mode === "overlay" ? cursorPos.x * zoom : cursorPos.x,
        top: mode === "overlay" ? cursorPos.y * zoom : cursorPos.y,
        width: eraserRingPx,
        height: eraserRingPx,
        transform: "translate(-50%, -50%)",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.35)",
      }}
    />
  ) : null;

  // ─────────────────────────────────────────────────────────────────
  // Toolbar
  // ─────────────────────────────────────────────────────────────────
  const Toolbar = (
    <>
      {showPanel && (
        <div className="flex flex-nowrap items-center gap-4 px-4 py-2 bg-[#16213e]/80 border-b border-white/10 shrink-0 backdrop-blur overflow-x-auto">
          {/* Pen / Eraser */}
          <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 shrink-0">
            <button
              onClick={() => setTool("pen")}
              title="Kalem (P)"
              className={cn(
                "p-2 rounded-lg transition-all",
                tool === "pen" ? "bg-primary text-white shadow-lg" : "text-white/50 hover:text-white hover:bg-white/10"
              )}
            >
              <Pen className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTool("eraser")}
              title="Silgi (E)"
              className={cn(
                "p-2 rounded-lg transition-all",
                tool === "eraser" ? "bg-orange-500 text-white shadow-lg" : "text-white/50 hover:text-white hover:bg-white/10"
              )}
            >
              <Eraser className="w-4 h-4" />
            </button>
            {tool === "eraser" && (
              <div className="flex items-center gap-1 ml-1">
                <button
                  onClick={() => setEraserMode("area")}
                  className={cn("px-2 py-1 rounded-md text-[10px] transition-all", eraserMode === "area" ? "bg-orange-500 text-white" : "text-white/60 hover:bg-white/10")}
                >
                  Alan
                </button>
                <button
                  onClick={() => setEraserMode("stroke")}
                  className={cn("px-2 py-1 rounded-md text-[10px] transition-all", eraserMode === "stroke" ? "bg-orange-500 text-white" : "text-white/60 hover:bg-white/10")}
                >
                  Çizgi
                </button>
              </div>
            )}
          </div>

          {/* Kalem türleri */}
          {tool === "pen" && (
            <div className="flex items-center gap-0.5 bg-white/5 rounded-xl p-1 shrink-0 border border-white/5">
              {PEN_KIND_OPTIONS.map(({ id, label, short }) => (
                <button
                  key={id}
                  type="button"
                  title={label}
                  onClick={() => setPenKind(id)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all whitespace-nowrap",
                    penKind === id ? "bg-primary text-white shadow" : "text-white/55 hover:text-white hover:bg-white/10",
                  )}
                >
                  {id === "ballpoint" && <Pen className="w-3 h-3 shrink-0" />}
                  {id === "fountain" && <Feather className="w-3 h-3 shrink-0" />}
                  {id === "pencil" && <PencilLine className="w-3 h-3 shrink-0" />}
                  {id === "brush" && <Brush className="w-3 h-3 shrink-0" />}
                  <span className="hidden xl:inline">{short}</span>
                </button>
              ))}
            </div>
          )}

          {/* Colors */}
          <div className="flex items-center gap-1.5 shrink-0">
            {COLORS.map((c) => (
              <button
                key={c.hex}
                onClick={() => { setColor(c.hex); setTool("pen"); }}
                title={c.name}
                style={{ backgroundColor: c.hex }}
                className={cn(
                  "w-5 h-5 rounded-full border-2 transition-all hover:scale-110",
                  tool === "pen" && color === c.hex ? "border-white scale-110 shadow-md" : "border-transparent"
                )}
              />
            ))}
          </div>

          {/* Kalınlık 1–100 */}
          {tool === "pen" && (
            <div className="flex items-center gap-2 min-w-[140px] max-w-[220px] shrink-0">
              <span className="text-[10px] text-white/40 w-7 tabular-nums">{penWidth}</span>
              <Slider
                min={1}
                max={100}
                step={1}
                value={[penWidth]}
                onValueChange={(v) => setPenWidth(v[0] ?? 35)}
                className="flex-1"
              />
            </div>
          )}
          {tool === "eraser" && (
            <div className="flex items-center gap-2 min-w-[140px] max-w-[220px] shrink-0">
              <span className="text-[10px] text-white/40 w-7 tabular-nums">{eraserWidth}</span>
              <Slider
                min={1}
                max={100}
                step={1}
                value={[eraserWidth]}
                onValueChange={(v) => setEraserWidth(v[0] ?? 35)}
                className="flex-1"
              />
            </div>
          )}

          {/* Separate mode image scale */}
          {mode === "separate" && imageUrl && (
            <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 shrink-0">
              {[1, 1.15, 1.3, 1.5].map((z) => (
                <button
                  key={z}
                  onClick={() => setSeparateImageScale(z)}
                  className={cn("px-2 py-1 rounded-md text-[10px] transition-all", Math.abs(separateImageScale - z) < 0.01 ? "bg-blue-600 text-white" : "text-white/60 hover:bg-white/10")}
                >
                  {Math.round(z * 100)}%
                </button>
              ))}
            </div>
          )}

          {/* Zoom controls — overlay mode only */}
          {mode === "overlay" && (
            <div className="flex items-center gap-0.5 bg-white/5 rounded-xl p-1 shrink-0">
              <button
                onClick={() => applyZoom(zoom / 1.25)}
                title="Uzaklaş (Ctrl −)"
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
                disabled={zoom <= MIN_ZOOM}
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-white/50 text-[11px] w-10 text-center select-none tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => applyZoom(zoom * 1.25)}
                title="Yaklaş (Ctrl +)"
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
                disabled={zoom >= MAX_ZOOM}
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => applyZoom(computeFitZoom())}
                title="Sayfaya sığdır (Ctrl 0)"
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Undo / Clear */}
          <div className="flex items-center gap-1 ml-auto shrink-0">
            <button
              onClick={() => {
                if (mode === "overlay") overlayDirtyRef.current = true;
                if (undoHistory.length > 0) {
                  setActiveStrokes(undoHistory[undoHistory.length - 1]);
                  setUndoHistory((p) => p.slice(0, -1));
                } else {
                  setActiveStrokes((p) => p.slice(0, -1));
                }
              }}
              disabled={activeStrokes.length === 0 && undoHistory.length === 0}
              title="Geri Al (Ctrl+Z)"
              className="flex items-center gap-1 px-2.5 py-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg text-xs transition-all disabled:opacity-30"
            >
              <Undo2 className="w-3.5 h-3.5" /> Geri Al
            </button>
            <button
              onClick={() => {
                if (activeStrokes.length > 0) {
                  if (mode === "overlay") overlayDirtyRef.current = true;
                  setUndoHistory((p) => [...p, activeStrokes]);
                  setActiveStrokes([]);
                }
              }}
              disabled={activeStrokes.length === 0}
              className="flex items-center gap-1 px-2.5 py-1.5 text-red-400/80 hover:text-red-400 hover:bg-red-500/10 rounded-lg text-xs transition-all disabled:opacity-30"
            >
              <Trash2 className="w-3.5 h-3.5" /> Temizle
            </button>
          </div>

          <div className="text-[10px] text-white/20 hidden lg:block">
            Zoom: Ctrl + tekerlek · Kaydır: tekerlek / çubuk (Ctrl olmadan)
          </div>
        </div>
      )}
    </>
  );

  // ─────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Hidden image loader */}
      {imageUrl && (
        <img
          ref={imgRef}
          src={imageUrl}
          alt=""
          aria-hidden
          style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
          onLoad={() => {
            setImgLoaded(true);
            updateImgLayout();
            renderOverlay();
          }}
        />
      )}

      <div className="flex flex-col w-full h-full bg-[#1a1a2e] select-none overflow-hidden">
        {/* Top bar */}
        <div className="flex flex-nowrap items-center gap-3 px-4 py-2 bg-[#16213e] border-b border-white/10 z-10 shrink-0 overflow-x-auto">
          <button
            onClick={handleClose}
            className="text-white/50 hover:text-white text-sm font-medium transition-colors px-2 py-1 rounded-lg hover:bg-white/10 shrink-0"
          >
            ← Kapat
          </button>

          {imageUrl && (
            <div className="flex items-center bg-white/5 rounded-xl p-0.5 gap-0.5 border border-white/10 shrink-0">
              <button
                onClick={() => setMode("overlay")}
                title="Resim üzerinde çiz"
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                  mode === "overlay" ? "bg-primary text-white shadow" : "text-white/50 hover:text-white hover:bg-white/10"
                )}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Resim Üstünde</span>
              </button>
              <button
                onClick={() => setMode("separate")}
                title="Müsvedde — çizimler kaydedilmez"
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                  mode === "separate" ? "bg-blue-600 text-white shadow" : "text-white/50 hover:text-white hover:bg-white/10"
                )}
              >
                <PenLine className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Müsvedde</span>
              </button>
            </div>
          )}

          {imageUrl && (
            <div className="flex items-center gap-2 text-[10px] text-white/30 shrink-0">
              <span title="Kayıtlı çizim (resim üstü)">
                <ImageIcon className="w-3 h-3 inline mr-0.5" />{overlayStrokes.length}
              </span>
              <span title="Müsvedde — kaydedilmez">
                <PenLine className="w-3 h-3 inline mr-0.5 opacity-60" />{boardStrokes.length}
              </span>
            </div>
          )}

          <div className="flex-1" />
          {!noSave && (
            <Button
              size="sm"
              onClick={handleDbSave}
              disabled={isSaving}
              className="rounded-xl gap-2 bg-primary/90 hover:bg-primary shrink-0"
            >
              <Save className="w-4 h-4" />
              {isSaving ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          )}
          <button
            onClick={() => setShowPanel((p) => !p)}
            className="text-white/50 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0"
            title="Araç çubuğunu gizle/göster"
          >
            {showPanel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Toolbar */}
        <div className="z-20 bg-[#1a1a2e] shrink-0">
          {Toolbar}
        </div>

        {/* ── OVERLAY mode: scrollable paper with zoom ── */}
        {mode === "overlay" ? (
          <div
            ref={scrollViewRef}
            className="flex-1 overflow-auto min-h-0 bg-[#1a1a2e]"
            style={{ position: "relative", overscrollBehavior: "contain" }}
          >
            <div className="flex min-w-full min-h-full justify-center items-start box-border p-2">
              <div
                style={{
                  position: "relative",
                  width: PAPER_W * zoom,
                  height: PAPER_H * zoom,
                  flexShrink: 0,
                  cursor: tool === "pen" || tool === "eraser" ? "none" : "crosshair",
                  touchAction: "none",
                }}
                {...pointerHandlers}
              >
                <canvas
                  ref={overlayBaseCanvasRef}
                  className="absolute top-0 left-0 touch-none z-0"
                  style={{ touchAction: "none", pointerEvents: "none" }}
                />
                <canvas
                  ref={overlayStrokeCanvasRef}
                  className="absolute top-0 left-0 touch-none z-[1]"
                  style={{ touchAction: "none", pointerEvents: "none" }}
                />
                {DotCursor}
                {EraserCursor}

              {/* Loading state */}
              {!imgLoaded && imageUrl && (
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{ top: 0, left: 0, width: "100%", height: "100%" }}
                >
                  <div className="text-white/30 text-sm">Yükleniyor…</div>
                </div>
              )}

              {/* Image position label */}
              {imgLoaded && imageUrl && (
                <div
                  className="absolute pointer-events-none text-[10px] text-white/25 font-medium"
                  style={{
                    left: imgLayoutRef.current.x * zoom,
                    top: (imgLayoutRef.current.y + imgLayoutRef.current.h + 6) * zoom,
                  }}
                >
                  ↑ Soru · Yanları ve altı çizim alanı
                </div>
              )}

              {!imageUrl && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-white/20 text-sm">Çizmeye başla</p>
                </div>
              )}
              </div>
            </div>
          </div>
        ) : (
          /* ── SEPARATE mode: image left, canvas right ── */
          <div ref={splitWrapRef} className="flex flex-1 overflow-hidden">
            {imageUrl && (
              <div
                className="flex items-start justify-center p-4 border-r border-border/40 bg-muted/30 overflow-auto shrink-0"
                style={{ width: `${separateImagePanelPct}%` }}
              >
                <img
                  src={imageUrl}
                  alt="Soru"
                  className="max-w-full object-contain rounded"
                  style={{
                    transform: `scale(${separateImageScale})`,
                    transformOrigin: "top center",
                  }}
                  draggable={false}
                />
              </div>
            )}
            {imageUrl && (
              <div
                className="w-2 shrink-0 cursor-col-resize bg-border/50 hover:bg-primary/40 transition-colors"
                onMouseDown={(e) => { e.preventDefault(); setIsResizingSplit(true); }}
                title="Soru alanını daralt/genişlet"
              />
            )}
            <div
              ref={containerRef}
              className="flex-1 relative overflow-hidden bg-background"
              style={{ cursor: tool === "pen" || tool === "eraser" ? "none" : "auto" }}
            >
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.04]"
                style={{
                  backgroundImage: `linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)`,
                  backgroundSize: "40px 40px",
                }}
              />
              <canvas
                ref={boardCanvasRef}
                className="absolute inset-0 touch-none"
                style={{ touchAction: "none" }}
                {...pointerHandlers}
              />
              {DotCursor}
              {EraserCursor}
              {activeStrokes.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <Pen className="w-10 h-10 text-white/10 mb-2" />
                  <p className="text-white/20 text-sm text-center px-4">
                    {noSave ? "Geçici müsvedde — kayıt yok" : "Müsvedde — kapatınca silinir, kaydedilmez"}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Unsaved Changes Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={(open) => { if (!open) setShowSaveDialog(false); }}>
        <DialogContent className="max-w-md mx-auto">
          <DialogTitle className="text-lg font-semibold">Değişiklikleri Kaydet</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Kaydedilmemiş çizim değişiklikleri var. Çıkmadan önce ne yapmak istersiniz?
          </DialogDescription>
          <div className="py-2">
            <div className="flex gap-3">
              <Button onClick={handleSaveAndClose} disabled={isSaving} className="flex-1">
                {isSaving ? "Kaydediliyor..." : "Kaydet ve Çık"}
              </Button>
              <Button variant="outline" onClick={handleDiscardAndClose} className="flex-1">
                Kaydetme
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Pen,
  Eraser,
  Trash2,
  Undo2,
  Save,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  PenLine,
  ZoomIn,
  ZoomOut,
  Maximize2,
  PencilLine,
  Brush,
  Feather,
  Square,
  RectangleHorizontal,
  Triangle,
  Circle,
  Minus,
  Type,
  MousePointer2,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSaveDrawing } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { renderDrawingStroke } from "@/lib/drawing-engine";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Pt {
  x: number;
  y: number;
  pressure: number;
}

/** 1–100 UI scale → canvas px (paper space) */
export type PenKind = "ballpoint" | "fountain" | "pencil" | "brush";
type ShapeKind =
  | "line"
  | "circle"
  | "square"
  | "rectangle"
  | "triangle"
  | "rightTriangle"
  | "trapezoid";
type CanvasTool = "pen" | "eraser" | "shape" | "text" | "select";

interface Stroke {
  tool: "pen" | "eraser" | "text";
  color: string;
  /** Kalem/silgi kalınlığı: 1–100 (Samsung Notes tarzı) */
  width: number;
  points: Pt[];
  /** Sadece kalem; eski kayıtlarda yok → tükenmez */
  penKind?: PenKind;
  snapShape?: "line" | ShapeKind;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  boxWidth?: number;
  boxHeight?: number;
  guide?: "lasso";
}
type EraserMode = "area" | "stroke";

type BoardSize = { width: number; height: number };
type SelectionState = {
  mode: "overlay" | "separate";
  indexes: number[];
};
type SelectionDragState = {
  start: Pt;
  original: Stroke[];
};
type TextEditorState = {
  mode: "overlay" | "separate";
  paperPoint: Pt;
  cssX: number;
  cssY: number;
  cssWidth: number;
  cssHeight: number;
  value: string;
};

export interface DrawingCanvasProps {
  questionId: number;
  imageUrl?: string | null;
  initialData?: string;
  onClose?: () => void;
  noSave?: boolean;
  onTempSave?: (canvasData: string) => void;
  defaultMode?: "overlay" | "separate";
  overlayChrome?: boolean;
  allowShapeTools?: boolean;
}

type TempDrawingPayload = {
  overlay: Stroke[];
  board: Stroke[];
  previewDataUrl?: string | null;
  boardSize?: { width: number; height: number } | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const COLORS = [
  { hex: "#0f0be7", name: "Mavi" },
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

const SHAPE_TOOL_OPTIONS: {
  id: ShapeKind;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
}[] = [
  { id: "line", label: "Düz Çizgi", icon: Minus },
  { id: "circle", label: "Çember", icon: Circle },
  { id: "square", label: "Kare", icon: Square },
  { id: "rectangle", label: "Dikdörtgen", icon: RectangleHorizontal },
  { id: "triangle", label: "Üçgen", icon: Triangle },
  {
    id: "rightTriangle",
    label: "Dik Üçgen",
    icon: Triangle,
    iconClassName: "rotate-90",
  },
  { id: "trapezoid", label: "Yamuk", icon: RectangleHorizontal },
];

// Fixed paper dimensions — same on every device so drawings stay in sync
const PAPER_W = 2000;
const PAPER_H = 2000;
/** Horizontal inset for the question image — larger = more side margin for drawing beside the image */
const IMG_SIDE_PAD = 36; // paper units
const IMG_TOP_PAD = 20; // paper units
/** Max image height on paper — keeps photos from dominating on wide / auto-fit zoom */
const IMG_MAX_HEIGHT = 760; // paper units
/** Never auto-zoom above 1.0 so large monitors don’t blow up the whole page */
const MAX_FIT_ZOOM = 1.0;

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4.0;
const MAX_CANVAS_DPR = 2;
const APPLE_CANVAS_DPR = 2;

function isApplePlatform() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  const platform = navigator.platform ?? "";
  return /Mac|iPhone|iPad|iPod/i.test(ua) || /Mac/i.test(platform);
}

function shouldUseReducedCanvasEffects() {
  if (typeof navigator === "undefined") return false;
  return (
    navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4
  );
}

function getCanvasDprForZoom(zoomLevel: number) {
  if (typeof window === "undefined") return 1;
  const device = window.devicePixelRatio || 1;
  const clampedZoom = Math.max(0.55, Math.min(2.5, zoomLevel || 1));
  const baseCap = isApplePlatform() ? APPLE_CANVAS_DPR : MAX_CANVAS_DPR;
  const zoomBoost = clampedZoom < 1 ? 1 / clampedZoom : 1;
  const hardCap = isApplePlatform() ? 2.4 : 2.6;
  const dynamicCap = Math.min(hardCap, baseCap * zoomBoost);
  return Math.min(device, dynamicCap);
}

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

function notesPaperPalette(theme: string | undefined) {
  if (theme === "dark") {
    return {
      paper: "#15171c",
      paperEdge: "#23262d",
      rule: "rgba(148, 163, 184, 0.08)",
      imageShadow: "rgba(0, 0, 0, 0.34)",
      imageStroke: "rgba(148, 163, 184, 0.22)",
      emptyPaper: "#1a1d24",
    };
  }

  return {
    paper: "#fffdf7",
    paperEdge: "#e8e2d3",
    rule: "rgba(180, 166, 141, 0.18)",
    imageShadow: "rgba(148, 163, 184, 0.24)",
    imageStroke: "rgba(148, 163, 184, 0.28)",
    emptyPaper: "#fffef9",
  };
}

function renderEraserTrail(
  ctx: CanvasRenderingContext2D,
  points: Pt[],
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
    ctx.shadowBlur = shouldUseReducedCanvasEffects()
      ? 1.5 + progress * 1.25
      : 8 + progress * 6;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    ctx.restore();
  }
}

function renderAreaEraserPreview(
  ctx: CanvasRenderingContext2D,
  points: Pt[],
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

function makeLinePoints(start: Pt, end: Pt): Pt[] {
  return [start, end];
}

function makeRectPoints(points: Pt[]): Pt[] {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pressure = points[points.length - 1]?.pressure ?? 0.7;
  return [
    { x: minX, y: minY, pressure },
    { x: maxX, y: minY, pressure },
    { x: maxX, y: maxY, pressure },
    { x: minX, y: maxY, pressure },
    { x: minX, y: minY, pressure },
  ];
}

function makeCirclePoints(points: Pt[]): Pt[] {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = Math.max(6, (maxX - minX) / 2);
  const ry = Math.max(6, (maxY - minY) / 2);
  const pressure = points[points.length - 1]?.pressure ?? 0.7;
  const startAngle = Math.atan2(points[0].y - cy, points[0].x - cx);
  const out: Pt[] = [];
  for (let i = 0; i <= 32; i++) {
    const t = startAngle + (Math.PI * 2 * i) / 32;
    out.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry, pressure });
  }
  return out;
}

function makeSquarePointsFromBounds(start: Pt, end: Pt): Pt[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const size = Math.max(8, Math.min(Math.abs(dx), Math.abs(dy)));
  const x2 = start.x + (dx >= 0 ? size : -size);
  const y2 = start.y + (dy >= 0 ? size : -size);
  const pressure = end.pressure ?? start.pressure ?? 0.7;
  return makeRectPoints([start, { x: x2, y: y2, pressure }]);
}

function makeTrianglePointsFromBounds(start: Pt, end: Pt): Pt[] {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const pressure = end.pressure ?? start.pressure ?? 0.7;
  return makePolygonPoints(
    [
      { x: (minX + maxX) / 2, y: minY, pressure },
      { x: maxX, y: maxY, pressure },
      { x: minX, y: maxY, pressure },
    ],
    pressure,
  );
}

function makeRightTrianglePointsFromBounds(start: Pt, end: Pt): Pt[] {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const pressure = end.pressure ?? start.pressure ?? 0.7;
  return makePolygonPoints(
    [
      { x: minX, y: minY, pressure },
      { x: minX, y: maxY, pressure },
      { x: maxX, y: maxY, pressure },
    ],
    pressure,
  );
}

function makeTrapezoidPointsFromBounds(start: Pt, end: Pt): Pt[] {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const pressure = end.pressure ?? start.pressure ?? 0.7;
  const inset = Math.max(10, (maxX - minX) * 0.2);
  return makePolygonPoints(
    [
      { x: minX + inset, y: minY, pressure },
      { x: maxX - inset, y: minY, pressure },
      { x: maxX, y: maxY, pressure },
      { x: minX, y: maxY, pressure },
    ],
    pressure,
  );
}

function buildShapeStroke(
  baseStroke: Stroke,
  end: Pt,
  shapeKind: ShapeKind,
): Stroke {
  const start = baseStroke.points[0] ?? end;
  const points =
    shapeKind === "line"
      ? makeLinePoints(start, end)
      : shapeKind === "circle"
        ? makeCirclePoints([start, end])
        : shapeKind === "square"
          ? makeSquarePointsFromBounds(start, end)
          : shapeKind === "rectangle"
            ? makeRectPoints([start, end])
            : shapeKind === "triangle"
              ? makeTrianglePointsFromBounds(start, end)
              : shapeKind === "rightTriangle"
                ? makeRightTrianglePointsFromBounds(start, end)
                : makeTrapezoidPointsFromBounds(start, end);

  return {
    ...baseStroke,
    tool: "pen",
    points,
    snapShape: shapeKind === "line" ? "line" : shapeKind,
  };
}

function makePolygonPoints(points: Pt[], pressure: number): Pt[] {
  const out = points.map((point) => ({ x: point.x, y: point.y, pressure }));
  if (out.length > 0) out.push({ ...out[0] });
  return out;
}

/** Eski kayıtlardaki piksel kalınlıklarını 1–100 ölçeğe taşır */
function normalizeStrokeForLoad(s: Stroke): Stroke {
  if (s.tool === "text") {
    const point = s.points?.[0] ?? { x: 80, y: 80, pressure: 0.7 };
    return {
      ...s,
      points: [point],
      color: s.color || "#0f0be7",
      width: Math.min(100, Math.max(1, s.width || 10)),
      text: typeof s.text === "string" ? s.text : "",
      fontSize:
        typeof s.fontSize === "number" ? s.fontSize : 26 + (s.width || 10) * 2,
      boxWidth: typeof s.boxWidth === "number" ? s.boxWidth : undefined,
      boxHeight: typeof s.boxHeight === "number" ? s.boxHeight : undefined,
    };
  }

  const kind: PenKind = s.penKind ?? "ballpoint";
  // Eski kayıtlar penKind içermez; yeni kayıtlar için dönüştürme yapma
  const isOldFormat = s.penKind === undefined;

  if (s.tool === "eraser") {
    const w = s.width;
    // Sadece eski format ve eski piksel değerleri için dönüştür
    if (
      isOldFormat &&
      w <= 40 &&
      Number.isInteger(w) &&
      [10, 16, 24, 34].includes(w)
    ) {
      const map: Record<number, number> = { 10: 12, 16: 22, 24: 38, 34: 58 };
      return { ...s, width: map[w] };
    }
    if (w > 0 && w <= 100) return { ...s, width: w };
    return {
      ...s,
      width: Math.min(100, Math.max(1, Math.round((w / 80) * 100))),
    };
  }

  const w = s.width;
  // Sadece eski format ve eski piksel değerleri için dönüştür
  if (
    isOldFormat &&
    w <= 16 &&
    Number.isInteger(w) &&
    [2, 4, 7, 12].includes(w)
  ) {
    const map: Record<number, number> = { 2: 18, 4: 35, 7: 55, 12: 85 };
    return { ...s, width: map[w], penKind: kind };
  }
  if (w > 0 && w <= 100) return { ...s, penKind: kind };
  return {
    ...s,
    width: Math.min(100, Math.max(1, Math.round(w))),
    penKind: kind,
  };
}

function textFontSizeFromWidth(width: number) {
  return Math.max(18, Math.min(86, 22 + width * 2.2));
}

function getStrokeBounds(stroke: Stroke) {
  if (stroke.tool === "text") {
    const anchor = stroke.points[0];
    const text = stroke.text?.trim();
    if (!anchor || !text) return null;
    const fontSize = Math.max(
      12,
      stroke.fontSize ?? textFontSizeFromWidth(stroke.width),
    );
    const lines = text.split(/\r?\n/);
    const maxLineLength = Math.max(...lines.map((line) => line.length), 1);
    const width =
      stroke.boxWidth ??
      Math.max(fontSize * 1.6, maxLineLength * fontSize * 0.58);
    const height =
      stroke.boxHeight ?? Math.max(fontSize, lines.length * fontSize * 1.22);
    return {
      minX: anchor.x,
      minY: anchor.y,
      maxX: anchor.x + width,
      maxY: anchor.y + height,
    };
  }

  if (!stroke.points.length) return null;
  const xs = stroke.points.map((point) => point.x);
  const ys = stroke.points.map((point) => point.y);
  const pad =
    stroke.tool === "eraser"
      ? Math.max(4, eraserScaleToWidth(stroke.width) / 2)
      : Math.max(3, penScaleToPx(stroke.width) / 2);
  return {
    minX: Math.min(...xs) - pad,
    minY: Math.min(...ys) - pad,
    maxX: Math.max(...xs) + pad,
    maxY: Math.max(...ys) + pad,
  };
}

function mergeBounds(bounds: Array<ReturnType<typeof getStrokeBounds>>) {
  const valid = bounds.filter(
    (bound): bound is NonNullable<typeof bound> => !!bound,
  );
  if (!valid.length) return null;
  return {
    minX: Math.min(...valid.map((bound) => bound.minX)),
    minY: Math.min(...valid.map((bound) => bound.minY)),
    maxX: Math.max(...valid.map((bound) => bound.maxX)),
    maxY: Math.max(...valid.map((bound) => bound.maxY)),
  };
}

function pointInPolygon(point: Pt, polygon: Pt[]) {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y || 1) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function strokeTouchesPolygon(stroke: Stroke, polygon: Pt[]) {
  if (stroke.tool === "eraser") return false;
  const bounds = getStrokeBounds(stroke);
  if (!bounds) return false;
  const candidates =
    stroke.tool === "text"
      ? [
          { x: bounds.minX, y: bounds.minY, pressure: 0.7 },
          { x: bounds.maxX, y: bounds.minY, pressure: 0.7 },
          { x: bounds.maxX, y: bounds.maxY, pressure: 0.7 },
          { x: bounds.minX, y: bounds.maxY, pressure: 0.7 },
          {
            x: (bounds.minX + bounds.maxX) / 2,
            y: (bounds.minY + bounds.maxY) / 2,
            pressure: 0.7,
          },
        ]
      : stroke.points;
  return candidates.some((point) => pointInPolygon(point, polygon));
}

function translateStroke(stroke: Stroke, dx: number, dy: number): Stroke {
  return {
    ...stroke,
    points: stroke.points.map((point) => ({
      ...point,
      x: point.x + dx,
      y: point.y + dy,
    })),
  };
}

function isPointInBounds(
  point: Pt,
  bounds: NonNullable<ReturnType<typeof getStrokeBounds>>,
  pad = 12,
) {
  return (
    point.x >= bounds.minX - pad &&
    point.x <= bounds.maxX + pad &&
    point.y >= bounds.minY - pad &&
    point.y <= bounds.maxY + pad
  );
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

function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  cache = true,
) {
  if (stroke.guide === "lasso") {
    renderLassoGuide(ctx, stroke.points);
    return;
  }
  renderDrawingStroke(ctx, stroke, { widthMode: "scale", cache });
}

function renderLassoGuide(ctx: CanvasRenderingContext2D, points: Pt[]) {
  if (points.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(100, 116, 139, 0.88)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

function renderSelectionBounds(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  selection: SelectionState | null,
  mode: "overlay" | "separate",
) {
  if (!selection || selection.mode !== mode || selection.indexes.length === 0)
    return;
  const bounds = mergeBounds(
    selection.indexes.map((index) => getStrokeBounds(strokes[index])),
  );
  if (!bounds) return;
  const pad = 10;

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(14, 165, 233, 0.95)";
  ctx.fillStyle = "rgba(14, 165, 233, 0.06)";
  ctx.setLineDash([18, 12]);
  ctx.strokeRect(
    bounds.minX - pad,
    bounds.minY - pad,
    bounds.maxX - bounds.minX + pad * 2,
    bounds.maxY - bounds.minY + pad * 2,
  );
  ctx.setLineDash([]);
  ctx.fillRect(
    bounds.minX - pad,
    bounds.minY - pad,
    bounds.maxX - bounds.minX + pad * 2,
    bounds.maxY - bounds.minY + pad * 2,
  );
  ctx.restore();
}

function eraseStrokesByPath(
  strokes: Stroke[],
  eraserPath: Pt[],
  radius: number,
): Stroke[] {
  if (!eraserPath.length || radius <= 0) return strokes;

  const r2 = radius * radius;

  // Nokta-çizgi segmenti mesafe karesi (projection ile)
  const pointToSegmentDist2 = (p: Pt, a: Pt, b: Pt): number => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;

    if (len2 === 0) {
      // a ve b aynı nokta
      const ddx = p.x - a.x;
      const ddy = p.y - a.y;
      return ddx * ddx + ddy * ddy;
    }

    // Projection faktörü [0, 1] aralığında
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));

    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    const ddx = p.x - projX;
    const ddy = p.y - projY;
    return ddx * ddx + ddy * ddy;
  };

  // İki çizgi segmenti kesişiyor mu (orientasyon testi)
  const segmentsIntersect = (a1: Pt, a2: Pt, b1: Pt, b2: Pt): boolean => {
    const ccw = (A: Pt, B: Pt, C: Pt) =>
      (C.y - A.y) * (B.x - A.x) - (B.y - A.y) * (C.x - A.x);

    const d1 = ccw(b1, b2, a1);
    const d2 = ccw(b1, b2, a2);
    const d3 = ccw(a1, a2, b1);
    const d4 = ccw(a1, a2, b2);

    // Genel kesişim durumu
    if (
      ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
    ) {
      return true;
    }

    // Doğrusal (collinear) durumlar - bounding box kontrolü
    const onSegment = (s1: Pt, s2: Pt, p: Pt): boolean => {
      return (
        p.x <= Math.max(s1.x, s2.x) + 0.001 &&
        p.x >= Math.min(s1.x, s2.x) - 0.001 &&
        p.y <= Math.max(s1.y, s2.y) + 0.001 &&
        p.y >= Math.min(s1.y, s2.y) - 0.001
      );
    };

    if (Math.abs(d1) < 0.001 && onSegment(b1, b2, a1)) return true;
    if (Math.abs(d2) < 0.001 && onSegment(b1, b2, a2)) return true;
    if (Math.abs(d3) < 0.001 && onSegment(a1, a2, b1)) return true;
    if (Math.abs(d4) < 0.001 && onSegment(a1, a2, b2)) return true;

    return false;
  };

  // Silgi yolunu segmentlere ayır
  const eraserSegments: [Pt, Pt][] = [];
  for (let i = 1; i < eraserPath.length; i++) {
    eraserSegments.push([eraserPath[i - 1], eraserPath[i]]);
  }

  return strokes.filter((stroke) => {
    if (stroke.tool === "eraser") return true;
    if (stroke.points.length === 0) return true;

    if (stroke.tool === "text") {
      const bounds = getStrokeBounds(stroke);
      if (!bounds) return true;
      return !eraserPath.some(
        (point) =>
          point.x >= bounds.minX - radius &&
          point.x <= bounds.maxX + radius &&
          point.y >= bounds.minY - radius &&
          point.y <= bounds.maxY + radius,
      );
    }

    // Çizgi segmentlerini oluştur
    const strokeSegments: [Pt, Pt][] = [];
    for (let i = 1; i < stroke.points.length; i++) {
      strokeSegments.push([stroke.points[i - 1], stroke.points[i]]);
    }

    // Tüm kombinasyonları kontrol et
    for (const [sp1, sp2] of strokeSegments) {
      for (const [ep1, ep2] of eraserSegments) {
        // 1. Segment kesişimi kontrolü
        if (segmentsIntersect(sp1, sp2, ep1, ep2)) {
          return false; // Sil
        }

        // 2. Nokta-segment mesafe kontrolü (çizgi noktaları ile silgi segmenti)
        if (pointToSegmentDist2(sp1, ep1, ep2) <= r2) return false;
        if (pointToSegmentDist2(sp2, ep1, ep2) <= r2) return false;

        // 3. Nokta-segment mesafe kontrolü (silgi noktaları ile çizgi segmenti)
        if (pointToSegmentDist2(ep1, sp1, sp2) <= r2) return false;
        if (pointToSegmentDist2(ep2, sp1, sp2) <= r2) return false;
      }
    }

    // 4. Noktadan noktaya mesafe kontrolü (orijinal davranış)
    for (const sp of stroke.points) {
      for (const ep of eraserPath) {
        const dx = sp.x - ep.x;
        const dy = sp.y - ep.y;
        if (dx * dx + dy * dy <= r2) return false;
      }
    }

    return true; // Tut
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
  overlayChrome = false,
  allowShapeTools = true,
}: DrawingCanvasProps) {
  const [mode, setMode] = useState<"overlay" | "separate">(
    defaultMode ?? (imageUrl ? "overlay" : "separate"),
  );
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Canvas & refs — overlay uses two stacked layers so eraser (destination-out) never punches through paper/image
  const overlayBaseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayStrokeCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayPaperRef = useRef<HTMLDivElement>(null);
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
  const dprRef = useRef(getCanvasDprForZoom(1));

  // Separate mode state
  const [separateImageScale, setSeparateImageScale] = useState(1.0);
  const [separateImagePanelPct, setSeparateImagePanelPct] = useState(52);
  const [isResizingSplit, setIsResizingSplit] = useState(false);
  const splitWrapRef = useRef<HTMLDivElement>(null);

  // Tools
  const [tool, setTool] = useState<CanvasTool>("pen");
  const [shapeKind, setShapeKind] = useState<ShapeKind>("rectangle");
  const [color, setColor] = useState(COLORS[0].hex);
  const [penKind, setPenKind] = useState<PenKind>("ballpoint");
  const penKindRef = useRef<PenKind>(penKind);
  penKindRef.current = penKind;
  /** 1–100 kalem kalınlığı */
  const [penWidth, setPenWidth] = useState(10);
  /** 1–100 silgi kalınlığı */
  const [eraserWidth, setEraserWidth] = useState(35);
  const [eraserMode, setEraserMode] = useState<EraserMode>("stroke");
  const toolRef = useRef<CanvasTool>(tool);
  toolRef.current = tool;
  const setToolIfChanged = useCallback((nextTool: CanvasTool) => {
    if (toolRef.current === nextTool) return;
    toolRef.current = nextTool;
    setTool(nextTool);
  }, []);
  const penWidthRef = useRef(penWidth);
  penWidthRef.current = penWidth;
  const eraserWidthRef = useRef(eraserWidth);
  eraserWidthRef.current = eraserWidth;

  // Strokes
  const [overlayStrokes, setOverlayStrokes] = useState<Stroke[]>([]);
  const [boardStrokes, setBoardStrokes] = useState<Stroke[]>([]);
  const overlayStrokesRef = useRef<Stroke[]>([]);
  const boardStrokesRef = useRef<Stroke[]>([]);
  overlayStrokesRef.current = overlayStrokes;
  boardStrokesRef.current = boardStrokes;
  const tempSaveHandlerRef = useRef(onTempSave);
  tempSaveHandlerRef.current = onTempSave;

  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const selectionRef = useRef<SelectionState | null>(null);
  selectionRef.current = selection;
  const selectionDragRef = useRef<SelectionDragState | null>(null);
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [shapeToolsOpen, setShapeToolsOpen] = useState(false);

  // cursorPos: CSS coordinates relative to active drawing surface
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [cursorInCanvas, setCursorInCanvas] = useState(false);
  const cursorPosRef = useRef<{ x: number; y: number } | null>(null);
  const cursorInCanvasRef = useRef(false);
  cursorPosRef.current = cursorPos;
  cursorInCanvasRef.current = cursorInCanvas;
  const cursorFrameRef = useRef<number | null>(null);
  const drawFrameRef = useRef<number | null>(null);
  const pendingCursorStateRef = useRef<{
    inCanvas: boolean;
    pos: { x: number; y: number } | null;
  }>({
    inCanvas: false,
    pos: null,
  });
  const lastCursorStateRef = useRef<{
    inCanvas: boolean;
    pos: { x: number; y: number } | null;
  }>({
    inCanvas: false,
    pos: null,
  });
  const [undoHistory, setUndoHistory] = useState<Stroke[][]>([]);
  const useCustomCursor = !isApplePlatform();
  const bodyCursorBeforeHideRef = useRef<string | null>(null);

  /** Sadece resim üstü (overlay) değişince kayıt uyarısı — ayrı tahta müsvedde, kaydedilmez */
  const overlayDirtyRef = useRef(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const saveDrawingMutation = useSaveDrawing();
  const queryClient = useQueryClient();
  const { theme, systemTheme } = useTheme();
  const currentTheme = theme === "system" ? systemTheme : theme;

  const activeStrokes = mode === "overlay" ? overlayStrokes : boardStrokes;
  const activeStrokesRef =
    mode === "overlay" ? overlayStrokesRef : boardStrokesRef;
  const currentBoardSizeRef = useRef<BoardSize | null>(null);
  const boardModelSizeRef = useRef<BoardSize | null>(null);

  // Keep visible board size and backing buffer synced to avoid a dead strip on the right edge.
  const syncSeparateBoardCanvasSize = useCallback(() => {
    const canvas = boardCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width === 0 || height === 0) return;
    currentBoardSizeRef.current = { width, height };
    if (!boardModelSizeRef.current) {
      boardModelSizeRef.current = { width, height };
    }

    const dpr = getCanvasDprForZoom(1);
    const targetWidth = Math.round(width * dpr);
    const targetHeight = Math.round(height * dpr);

    if (canvas.width === targetWidth && canvas.height === targetHeight) return;

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const modelSize = boardModelSizeRef.current ?? { width, height };
    const scaleX = width / Math.max(modelSize.width, 1);
    const scaleY = height / Math.max(modelSize.height, 1);
    ctx.setTransform(dpr * scaleX, 0, 0, dpr * scaleY, 0, 0);
    ctx.clearRect(0, 0, modelSize.width, modelSize.height);
    for (const stroke of boardStrokesRef.current) renderStroke(ctx, stroke);
  }, []);

  // Pointer baslangicinda imlec-cizim kaymasini onlemek icin hafif boyut senkronu.
  // Degisiklik yoksa hicbir sey yapmaz.
  const ensureSeparateBoardCanvasIsCurrent = useCallback(() => {
    const canvas = boardCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = getCanvasDprForZoom(1);
    const expectedW = Math.round(rect.width * dpr);
    const expectedH = Math.round(rect.height * dpr);
    if (canvas.width === expectedW && canvas.height === expectedH) return;

    canvas.width = expectedW;
    canvas.height = expectedH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const modelSize =
      boardModelSizeRef.current ??
      (boardModelSizeRef.current = { width: rect.width, height: rect.height });
    const scaleX = rect.width / Math.max(modelSize.width, 1);
    const scaleY = rect.height / Math.max(modelSize.height, 1);
    ctx.setTransform(dpr * scaleX, 0, 0, dpr * scaleY, 0, 0);
    ctx.clearRect(0, 0, modelSize.width, modelSize.height);
    for (const stroke of boardStrokesRef.current) renderStroke(ctx, stroke);
  }, []);

  const buildTempSavePayload = useCallback((): string => {
    const boardRect = boardCanvasRef.current?.getBoundingClientRect();
    const stableBoardSize =
      boardModelSizeRef.current ??
      currentBoardSizeRef.current ??
      (boardRect && boardRect.width > 20 && boardRect.height > 20
        ? { width: boardRect.width, height: boardRect.height }
        : null);
    const payload: TempDrawingPayload = {
      overlay: overlayStrokesRef.current,
      board: boardStrokesRef.current,
      previewDataUrl: null,
      boardSize: stableBoardSize,
    };

    return JSON.stringify(payload);
  }, []);

  const setActiveStrokes = useCallback(
    (updater: Stroke[] | ((prev: Stroke[]) => Stroke[])) => {
      if (modeRef.current === "overlay") setOverlayStrokes(updater as any);
      else setBoardStrokes(updater as any);
    },
    [],
  );

  const getTextEditorCssPosition = useCallback(
    (point: Pt, targetMode = modeRef.current) => {
      if (targetMode === "overlay") {
        return {
          cssX: point.x * zoomRef.current,
          cssY: point.y * zoomRef.current,
        };
      }

      const canvas = boardCanvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const modelSize = boardModelSizeRef.current;
      if (!rect || !modelSize) return { cssX: point.x, cssY: point.y };
      return {
        cssX: (point.x / Math.max(modelSize.width, 1)) * rect.width,
        cssY: (point.y / Math.max(modelSize.height, 1)) * rect.height,
      };
    },
    [],
  );

  const getTextEditorPaperPointFromCss = useCallback(
    (cssX: number, cssY: number, targetMode = modeRef.current): Pt => {
      if (targetMode === "overlay") {
        return {
          x: cssX / Math.max(zoomRef.current, 0.01),
          y: cssY / Math.max(zoomRef.current, 0.01),
          pressure: 0.7,
        };
      }

      const canvas = boardCanvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const modelSize = boardModelSizeRef.current;
      if (!rect || !modelSize) return { x: cssX, y: cssY, pressure: 0.7 };
      return {
        x: (cssX / Math.max(rect.width, 1)) * modelSize.width,
        y: (cssY / Math.max(rect.height, 1)) * modelSize.height,
        pressure: 0.7,
      };
    },
    [],
  );

  const getTextEditorPaperSizeFromCss = useCallback(
    (
      cssWidth: number,
      cssHeight: number,
      targetMode = modeRef.current,
    ): { width: number; height: number } => {
      if (targetMode === "overlay") {
        const scale = Math.max(zoomRef.current, 0.01);
        return { width: cssWidth / scale, height: cssHeight / scale };
      }

      const canvas = boardCanvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const modelSize = boardModelSizeRef.current;
      if (!rect || !modelSize) return { width: cssWidth, height: cssHeight };
      return {
        width: (cssWidth / Math.max(rect.width, 1)) * modelSize.width,
        height: (cssHeight / Math.max(rect.height, 1)) * modelSize.height,
      };
    },
    [],
  );

  const openTextEditorAt = useCallback(
    (point: Pt) => {
      const targetMode = modeRef.current;
      const { cssX, cssY } = getTextEditorCssPosition(point, targetMode);
      setSelection(null);
      setTextEditor({
        mode: targetMode,
        paperPoint: point,
        cssX,
        cssY,
        cssWidth:
          targetMode === "overlay" ? Math.max(220, 340 * zoomRef.current) : 340,
        cssHeight:
          targetMode === "overlay"
            ? Math.max(
                72,
                textFontSizeFromWidth(penWidthRef.current) *
                  zoomRef.current *
                  2.15,
              )
            : Math.max(72, textFontSizeFromWidth(penWidthRef.current) * 2.15),
        value: "",
      });
    },
    [getTextEditorCssPosition],
  );

  const beginTextEditorMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const editor = textEditor;
      if (!editor) return;
      event.preventDefault();
      event.stopPropagation();
      const startClientX = event.clientX;
      const startClientY = event.clientY;
      const startCssX = editor.cssX;
      const startCssY = editor.cssY;
      const modeAtStart = editor.mode;

      const onMove = (moveEvent: PointerEvent) => {
        const cssX = Math.max(0, startCssX + moveEvent.clientX - startClientX);
        const cssY = Math.max(0, startCssY + moveEvent.clientY - startClientY);
        setTextEditor((current) =>
          current && current.mode === modeAtStart
            ? {
                ...current,
                cssX,
                cssY,
                paperPoint: getTextEditorPaperPointFromCss(
                  cssX,
                  cssY,
                  current.mode,
                ),
              }
            : current,
        );
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    },
    [getTextEditorPaperPointFromCss, textEditor],
  );

  const beginTextEditorResize = useCallback(
    (
      event: React.PointerEvent<HTMLElement>,
      corner: "nw" | "ne" | "sw" | "se",
    ) => {
      const editor = textEditor;
      if (!editor) return;
      event.preventDefault();
      event.stopPropagation();

      const startClientX = event.clientX;
      const startClientY = event.clientY;
      const start = { ...editor };
      const minWidth = 150;
      const minHeight = 46;

      const onMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startClientX;
        const dy = moveEvent.clientY - startClientY;
        let cssX = start.cssX;
        let cssY = start.cssY;
        let cssWidth = start.cssWidth;
        let cssHeight = start.cssHeight;

        if (corner.includes("e")) cssWidth = start.cssWidth + dx;
        if (corner.includes("s")) cssHeight = start.cssHeight + dy;
        if (corner.includes("w")) {
          cssX = start.cssX + dx;
          cssWidth = start.cssWidth - dx;
        }
        if (corner.includes("n")) {
          cssY = start.cssY + dy;
          cssHeight = start.cssHeight - dy;
        }

        if (cssWidth < minWidth) {
          if (corner.includes("w")) cssX -= minWidth - cssWidth;
          cssWidth = minWidth;
        }
        if (cssHeight < minHeight) {
          if (corner.includes("n")) cssY -= minHeight - cssHeight;
          cssHeight = minHeight;
        }
        cssX = Math.max(0, cssX);
        cssY = Math.max(0, cssY);

        setTextEditor((current) =>
          current && current.mode === start.mode
            ? {
                ...current,
                cssX,
                cssY,
                cssWidth,
                cssHeight,
                paperPoint: getTextEditorPaperPointFromCss(
                  cssX,
                  cssY,
                  current.mode,
                ),
              }
            : current,
        );
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    },
    [getTextEditorPaperPointFromCss, textEditor],
  );

  const commitTextEditor = useCallback(
    (shouldCommit = true) => {
      setTextEditor((editor) => {
        if (!editor) return null;
        const text = editor.value.trim();
        if (!shouldCommit || text.length === 0) return null;
        const boxSize = getTextEditorPaperSizeFromCss(
          editor.cssWidth,
          editor.cssHeight,
          editor.mode,
        );

        const textStroke: Stroke = {
          tool: "text",
          color,
          width: penWidthRef.current,
          points: [editor.paperPoint],
          text,
          fontSize: textFontSizeFromWidth(penWidthRef.current),
          boxWidth: boxSize.width,
          boxHeight: boxSize.height,
        };

        setUndoHistory((prev) => [
          ...prev,
          editor.mode === "overlay"
            ? overlayStrokesRef.current
            : boardStrokesRef.current,
        ]);
        if (editor.mode === "overlay") {
          overlayDirtyRef.current = true;
          setOverlayStrokes((prev) => [...prev, textStroke]);
        } else {
          setBoardStrokes((prev) => [...prev, textStroke]);
        }
        return null;
      });
    },
    [color, getTextEditorPaperSizeFromCss],
  );

  const getSelectedBounds = useCallback(
    (strokes: Stroke[], selectionState: SelectionState | null) => {
      if (!selectionState || selectionState.mode !== modeRef.current)
        return null;
      return mergeBounds(
        selectionState.indexes.map((index) => getStrokeBounds(strokes[index])),
      );
    },
    [],
  );

  // ── Load initial data (does NOT mark dirty) — sadece overlay kalıcı; ayrı tahta her zaman boş (müsvedde) ──
  useEffect(() => {
    if (!initialData) {
      setOverlayStrokes([]);
      setBoardStrokes([]);
      boardModelSizeRef.current = null;
      overlayDirtyRef.current = false;
      return;
    }
    try {
      const parsed = JSON.parse(initialData);
      if (Array.isArray(parsed)) {
        setOverlayStrokes(
          parsed.map((s) => normalizeStrokeForLoad(s as Stroke)),
        );
        setBoardStrokes([]);
        boardModelSizeRef.current = null;
      } else if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.overlay)) {
          setOverlayStrokes(
            parsed.overlay.map((s: Stroke) => normalizeStrokeForLoad(s)),
          );
        } else {
          setOverlayStrokes([]);
        }
        if (Array.isArray(parsed.board)) {
          setBoardStrokes(
            parsed.board.map((s: Stroke) => normalizeStrokeForLoad(s)),
          );
        } else {
          setBoardStrokes([]);
        }
        if (
          parsed.boardSize &&
          typeof parsed.boardSize === "object" &&
          typeof parsed.boardSize.width === "number" &&
          typeof parsed.boardSize.height === "number" &&
          parsed.boardSize.width > 0 &&
          parsed.boardSize.height > 0
        ) {
          boardModelSizeRef.current = {
            width: parsed.boardSize.width,
            height: parsed.boardSize.height,
          };
        } else {
          boardModelSizeRef.current = null;
        }
      } else {
        setOverlayStrokes([]);
        setBoardStrokes([]);
        boardModelSizeRef.current = null;
      }
    } catch {
      setOverlayStrokes([]);
      setBoardStrokes([]);
      boardModelSizeRef.current = null;
    }
    overlayDirtyRef.current = false;
  }, [initialData]);

  // noSave modunda pencere kapanirken son cizimi kacirmamak icin unmount aninda bir kez daha snapshot gonder.
  useEffect(() => {
    if (!noSave) return;
    return () => {
      try {
        tempSaveHandlerRef.current?.(buildTempSavePayload());
      } catch {
        // noop
      }
    };
  }, [buildTempSavePayload, noSave]);

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
  const renderOverlayStrokeLayer = useCallback(() => {
    const strokeLayer = overlayStrokeCanvasRef.current;
    if (!strokeLayer || modeRef.current !== "overlay") return;
    const z = zoomRef.current;
    const dpr = dprRef.current || getCanvasDprForZoom(z);
    const physW = Math.round(PAPER_W * z * dpr);
    const physH = Math.round(PAPER_H * z * dpr);

    if (strokeLayer.width !== physW || strokeLayer.height !== physH) {
      strokeLayer.width = physW;
      strokeLayer.height = physH;
    }
    strokeLayer.style.width = `${PAPER_W * z}px`;
    strokeLayer.style.height = `${PAPER_H * z}px`;

    const ctxStroke = strokeLayer.getContext("2d")!;
    ctxStroke.imageSmoothingEnabled = true;
    ctxStroke.imageSmoothingQuality = "high";
    ctxStroke.setTransform(z * dpr, 0, 0, z * dpr, 0, 0);
    ctxStroke.clearRect(0, 0, PAPER_W, PAPER_H);
    for (const s of overlayStrokesRef.current) renderStroke(ctxStroke, s);
    const cs = currentStrokeRef.current;
    if (cs) {
      if (cs.tool === "eraser" && eraserMode === "stroke") {
        renderEraserTrail(ctxStroke, cs.points, segmentWidthPx(cs, 0.8, 0.8));
      }
      if (cs.tool === "eraser" && eraserMode === "area") {
        renderAreaEraserPreview(
          ctxStroke,
          cs.points,
          segmentWidthPx(cs, 0.8, 0.8),
        );
      }
      renderStroke(ctxStroke, cs, false);
    }
    renderSelectionBounds(
      ctxStroke,
      overlayStrokesRef.current,
      selectionRef.current,
      "overlay",
    );
  }, [eraserMode]);

  const renderOverlay = useCallback(() => {
    const base = overlayBaseCanvasRef.current;
    const strokeLayer = overlayStrokeCanvasRef.current;
    if (!base || !strokeLayer || modeRef.current !== "overlay") return;
    const z = zoomRef.current;
    dprRef.current = getCanvasDprForZoom(z);
    const dpr = dprRef.current;

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
    ctxBase.imageSmoothingEnabled = true;
    ctxBase.imageSmoothingQuality = "high";
    ctxBase.setTransform(z * dpr, 0, 0, z * dpr, 0, 0);
    ctxBase.clearRect(0, 0, PAPER_W, PAPER_H);

    const palette = notesPaperPalette(currentTheme);
    ctxBase.fillStyle = palette.paper;
    ctxBase.fillRect(0, 0, PAPER_W, PAPER_H);

    ctxBase.save();
    ctxBase.strokeStyle = palette.rule;
    ctxBase.lineWidth = 1;
    for (let y = 96; y < PAPER_H; y += 92) {
      ctxBase.beginPath();
      ctxBase.moveTo(44, y);
      ctxBase.lineTo(PAPER_W - 44, y);
      ctxBase.stroke();
    }
    ctxBase.restore();

    ctxBase.save();
    ctxBase.strokeStyle = palette.paperEdge;
    ctxBase.lineWidth = 3;
    ctxBase.strokeRect(1.5, 1.5, PAPER_W - 3, PAPER_H - 3);
    ctxBase.restore();

    const { x: imgX, y: imgY, w: imgW, h: imgH } = imgLayoutRef.current;

    if (imgRef.current && imgLoadedRef.current && imgW > 0) {
      ctxBase.save();
      ctxBase.shadowColor = palette.imageShadow;
      ctxBase.shadowBlur = shouldUseReducedCanvasEffects() ? 4 : 18;
      ctxBase.fillStyle = palette.emptyPaper;
      ctxBase.fillRect(imgX, imgY, imgW, imgH);
      ctxBase.restore();

      ctxBase.drawImage(imgRef.current, imgX, imgY, imgW, imgH);

      ctxBase.save();
      ctxBase.globalAlpha = 0.18;
      ctxBase.strokeStyle = palette.imageStroke;
      ctxBase.lineWidth = 1;
      ctxBase.strokeRect(imgX, imgY, imgW, imgH);
      ctxBase.restore();
    } else if (!imageUrl) {
      ctxBase.fillStyle = palette.emptyPaper;
      ctxBase.fillRect(0, 0, PAPER_W, PAPER_H);
    }

    renderOverlayStrokeLayer();
  }, [currentTheme, imageUrl, renderOverlayStrokeLayer]);

  // ── Compute fit zoom (fit paper width into viewport, cap so huge screens stay readable) ──
  const computeFitZoom = useCallback(() => {
    const sv = scrollViewRef.current;
    if (!sv) return 1;
    const widthFit = sv.clientWidth / PAPER_W;
    const z = Math.min(widthFit, MAX_FIT_ZOOM);
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
  }, []);

  const centerOverlayOnPaperPoint = useCallback(
    (paperX: number, paperY: number, targetZoom: number) => {
      const sv = scrollViewRef.current;
      const paper = overlayPaperRef.current;
      if (!sv || !paper) return;

      const targetLeft =
        paper.offsetLeft + paperX * targetZoom - sv.clientWidth / 2;
      const targetTop =
        paper.offsetTop + paperY * targetZoom - sv.clientHeight / 2;
      const maxScrollLeft = Math.max(0, sv.scrollWidth - sv.clientWidth);
      const maxScrollTop = Math.max(0, sv.scrollHeight - sv.clientHeight);

      sv.scrollLeft = Math.max(0, Math.min(maxScrollLeft, targetLeft));
      sv.scrollTop = Math.max(0, Math.min(maxScrollTop, targetTop));
    },
    [],
  );

  // ── Apply a new zoom, keeping the exact paper point under the pointer stable ──
  const applyZoom = useCallback(
    (newZoom: number, anchorCssX?: number, anchorCssY?: number) => {
      const sv = scrollViewRef.current;
      const paper = overlayPaperRef.current;
      if (!sv) return;
      const oldZoom = zoomRef.current;
      const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
      if (Math.abs(clamped - oldZoom) < 0.001) return;

      const hasExplicitAnchor =
        anchorCssX !== undefined || anchorCssY !== undefined;
      const cursorAnchor =
        !hasExplicitAnchor &&
        modeRef.current === "overlay" &&
        cursorInCanvasRef.current &&
        cursorPosRef.current &&
        paper
          ? {
              x: paper.offsetLeft + cursorPosRef.current.x - sv.scrollLeft,
              y: paper.offsetTop + cursorPosRef.current.y - sv.scrollTop,
            }
          : null;

      // Default anchor: center of the visible viewport
      const ax = anchorCssX ?? cursorAnchor?.x ?? sv.clientWidth / 2;
      const ay = anchorCssY ?? cursorAnchor?.y ?? sv.clientHeight / 2;

      // Paper coordinate under anchor. The paper can be centered inside a wider
      // scroll content, so subtract its current offset before converting to paper units.
      const oldPaperLeft = paper?.offsetLeft ?? 0;
      const oldPaperTop = paper?.offsetTop ?? 0;
      const paperX = Math.max(
        0,
        Math.min(PAPER_W, (sv.scrollLeft + ax - oldPaperLeft) / oldZoom),
      );
      const paperY = Math.max(
        0,
        Math.min(PAPER_H, (sv.scrollTop + ay - oldPaperTop) / oldZoom),
      );

      zoomRef.current = clamped;
      dprRef.current = getCanvasDprForZoom(clamped);
      setZoom(clamped);
      // Zoom/recenter sırasında cursor overlay pozisyonu bir frame gecikebilir; bir sonraki pointermove'da yeniden senkronla.
      setCursorInCanvas(false);
      setCursorPos(null);

      requestAnimationFrame(() => {
        if (!scrollViewRef.current) return;
        const { x, y, w, h } = imgLayoutRef.current;
        const hasQuestionImage = imgLoadedRef.current && w > 0 && h > 0;

        if (!hasExplicitAnchor && !cursorAnchor && hasQuestionImage) {
          centerOverlayOnPaperPoint(x + w / 2, y + h / 2, clamped);
        } else {
          const nextPaper = overlayPaperRef.current;
          const nextPaperLeft = nextPaper?.offsetLeft ?? 0;
          const nextPaperTop = nextPaper?.offsetTop ?? 0;
          const maxScrollLeft = Math.max(
            0,
            scrollViewRef.current.scrollWidth -
              scrollViewRef.current.clientWidth,
          );
          const maxScrollTop = Math.max(
            0,
            scrollViewRef.current.scrollHeight -
              scrollViewRef.current.clientHeight,
          );
          scrollViewRef.current.scrollLeft = Math.max(
            0,
            Math.min(maxScrollLeft, nextPaperLeft + paperX * clamped - ax),
          );
          scrollViewRef.current.scrollTop = Math.max(
            0,
            Math.min(maxScrollTop, nextPaperTop + paperY * clamped - ay),
          );
        }
        renderOverlay();
      });
    },
    [centerOverlayOnPaperPoint, renderOverlay],
  );

  // ── Setup overlay canvas: initial zoom + respond to resize ──
  useEffect(() => {
    if (mode !== "overlay") return;
    const sv = scrollViewRef.current;
    if (!sv) return;

    const init = () => {
      updateImgLayout();
      // On first render, fit the paper width to the viewport
      const fit = computeFitZoom();
      dprRef.current = getCanvasDprForZoom(fit);
      zoomRef.current = fit;
      setZoom(fit);
      requestAnimationFrame(() => {
        const { x, y, w, h } = imgLayoutRef.current;
        if (imgLoadedRef.current && w > 0 && h > 0) {
          centerOverlayOnPaperPoint(x + w / 2, y + h / 2, fit);
        }
        renderOverlay();
      });
    };

    const ro = new ResizeObserver(() => {
      dprRef.current = getCanvasDprForZoom(zoomRef.current);
      renderOverlay();
    });
    ro.observe(sv);
    init();
    return () => ro.disconnect();
  }, [
    mode,
    updateImgLayout,
    renderOverlay,
    computeFitZoom,
    centerOverlayOnPaperPoint,
  ]);

  // ── Reset zoom to fit when leaving / re-entering overlay mode ──
  useEffect(() => {
    setSelection(null);
    setTextEditor(null);
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
  }, [
    overlayStrokes,
    currentStroke,
    selection,
    mode,
    imgLoaded,
    renderOverlay,
    zoom,
  ]);

  // ── Separate mode canvas resize ──
  useEffect(() => {
    if (mode !== "separate") return;
    const container = containerRef.current;
    const canvas = boardCanvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      syncSeparateBoardCanvasSize();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [mode, syncSeparateBoardCanvasSize]);

  const renderSeparateCanvas = useCallback(() => {
    if (modeRef.current !== "separate") return;
    ensureSeparateBoardCanvasIsCurrent();
    const canvas = boardCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const modelSize =
      boardModelSizeRef.current ??
      (boardModelSizeRef.current = { width: rect.width, height: rect.height });
    const dpr = getCanvasDprForZoom(1);
    const scaleX = rect.width / Math.max(modelSize.width, 1);
    const scaleY = rect.height / Math.max(modelSize.height, 1);
    ctx.setTransform(dpr * scaleX, 0, 0, dpr * scaleY, 0, 0);
    ctx.clearRect(0, 0, modelSize.width, modelSize.height);
    for (const s of boardStrokesRef.current) renderStroke(ctx, s);
    const liveStroke = currentStrokeRef.current;
    if (liveStroke) {
      if (liveStroke.tool === "eraser" && eraserMode === "stroke") {
        renderEraserTrail(
          ctx,
          liveStroke.points,
          segmentWidthPx(liveStroke, 0.8, 0.8),
        );
      }
      if (liveStroke.tool === "eraser" && eraserMode === "area") {
        renderAreaEraserPreview(
          ctx,
          liveStroke.points,
          segmentWidthPx(liveStroke, 0.8, 0.8),
        );
      }
      renderStroke(ctx, liveStroke, false);
    }
    renderSelectionBounds(
      ctx,
      boardStrokesRef.current,
      selectionRef.current,
      "separate",
    );
  }, [eraserMode, ensureSeparateBoardCanvasIsCurrent]);

  // ── Redraw separate mode on stroke change ──
  useEffect(() => {
    if (mode !== "separate") return;
    renderSeparateCanvas();
  }, [
    mode,
    boardStrokes,
    currentStroke,
    selection,
    eraserMode,
    renderSeparateCanvas,
  ]);

  const requestCanvasRender = useCallback(() => {
    if (typeof window === "undefined") return;
    if (drawFrameRef.current !== null) return;
    drawFrameRef.current = window.requestAnimationFrame(() => {
      drawFrameRef.current = null;
      if (modeRef.current === "overlay") renderOverlayStrokeLayer();
      else renderSeparateCanvas();
    });
  }, [renderOverlayStrokeLayer, renderSeparateCanvas]);

  useEffect(() => {
    return () => {
      if (drawFrameRef.current !== null) {
        window.cancelAnimationFrame(drawFrameRef.current);
        drawFrameRef.current = null;
      }
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────
  // INPUT: Coordinate mapping → paper coordinates
  // getBoundingClientRect() of the canvas already accounts for scroll offset
  // so (clientX - rect.left) / zoom gives correct paper X on all devices.
  // ─────────────────────────────────────────────────────────────────
  const getPointFromClient = useCallback(
    (clientX: number, clientY: number, pressureInput: number): Pt => {
      const canvas =
        modeRef.current === "overlay"
          ? overlayStrokeCanvasRef.current
          : boardCanvasRef.current;
      if (!canvas)
        return {
          x: 0,
          y: 0,
          pressure: curvePressure(pressureInput > 0 ? pressureInput : 0.5),
        };
      const rect = canvas.getBoundingClientRect();
      const rawP = pressureInput > 0 ? pressureInput : 0.5;
      const pressure = curvePressure(rawP);
      if (modeRef.current === "overlay") {
        const z = zoomRef.current;
        return {
          x: (clientX - rect.left) / z,
          y: (clientY - rect.top) / z,
          pressure,
        };
      } else {
        const activeTool = toolRef.current;
        const edgeBleed =
          activeTool === "eraser"
            ? Math.max(4, eraserScaleToWidth(eraserWidthRef.current) * 0.5)
            : Math.max(4, penScaleToPx(penWidthRef.current) * 0.5);
        const modelSize =
          boardModelSizeRef.current ??
          (rect.width > 0 && rect.height > 0
            ? (boardModelSizeRef.current = {
                width: rect.width,
                height: rect.height,
              })
            : { width: rect.width || 1, height: rect.height || 1 });
        const localX = Math.min(
          rect.width + edgeBleed,
          Math.max(-edgeBleed, clientX - rect.left),
        );
        const localY = Math.min(
          rect.height + edgeBleed,
          Math.max(-edgeBleed, clientY - rect.top),
        );
        return {
          x: (localX / Math.max(rect.width, 1)) * modelSize.width,
          y: (localY / Math.max(rect.height, 1)) * modelSize.height,
          pressure,
        };
      }
    },
    [],
  );

  const getXY = useCallback(
    (e: React.PointerEvent): Pt => {
      return getPointFromClient(e.clientX, e.clientY, e.pressure);
    },
    [getPointFromClient],
  );

  // ─────────────────────────────────────────────────────────────────
  // POINTER EVENT HANDLERS
  // ─────────────────────────────────────────────────────────────────
  const isDrawingRef = useRef(false);
  const rawStrokeRef = useRef<Stroke | null>(null);

  const releasePointerCaptureSafely = (
    target: EventTarget | null,
    pointerId: number,
  ) => {
    if (!(target instanceof HTMLElement)) return;
    try {
      if (target.hasPointerCapture(pointerId))
        target.releasePointerCapture(pointerId);
    } catch {
      // Safari/Mac trackpad can drop pointer capture during gesture cancellation.
    }
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const isHardwareEraser = e.button === 5 || (e.buttons & 32) === 32;
      if (e.pointerType === "pen") {
        if (isHardwareEraser) setToolIfChanged("eraser");
        else if (
          toolRef.current !== "shape" &&
          toolRef.current !== "text" &&
          toolRef.current !== "select"
        )
          setToolIfChanged("pen");
      } else if (isHardwareEraser) {
        setToolIfChanged("eraser");
      }
      const activeTool: CanvasTool = isHardwareEraser
        ? "eraser"
        : e.pointerType === "pen"
          ? toolRef.current === "shape" ||
            toolRef.current === "text" ||
            toolRef.current === "select"
            ? toolRef.current
            : "pen"
          : tool;

      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      const pt = getXY(e);

      if (activeTool === "text") {
        releasePointerCaptureSafely(e.currentTarget, e.pointerId);
        openTextEditorAt(pt);
        return;
      }

      if (activeTool === "select") {
        const currentSelection = selectionRef.current;
        const selectedBounds = getSelectedBounds(
          activeStrokesRef.current,
          currentSelection,
        );
        if (selectedBounds && isPointInBounds(pt, selectedBounds, 20)) {
          selectionDragRef.current = {
            start: pt,
            original: activeStrokesRef.current,
          };
          setUndoHistory((prev) => [...prev, activeStrokesRef.current]);
          isDrawingRef.current = true;
          return;
        }

        setSelection(null);
        const lassoStroke: Stroke = {
          tool: "pen",
          color: "#64748b",
          width: 5,
          points: [pt],
          penKind: "ballpoint",
          guide: "lasso",
        };
        isDrawingRef.current = true;
        setCurrentStroke(lassoStroke);
        currentStrokeRef.current = lassoStroke;
        rawStrokeRef.current = lassoStroke;
        requestCanvasRender();
        return;
      }

      setSelection(null);
      isDrawingRef.current = true;

      const stroke: Stroke = {
        tool: activeTool === "eraser" ? "eraser" : "pen",
        color: activeTool === "eraser" ? "#000000" : color,
        width: activeTool === "eraser" ? eraserWidth : penWidth,
        points: [pt],
        ...(activeTool !== "eraser" ? { penKind } : {}),
        ...(activeTool === "shape" ? { snapShape: shapeKind } : {}),
      };
      setCurrentStroke(stroke);
      currentStrokeRef.current = stroke;
      rawStrokeRef.current = stroke;
      requestCanvasRender();
    },
    [
      getXY,
      color,
      penWidth,
      eraserWidth,
      tool,
      penKind,
      shapeKind,
      requestCanvasRender,
      setToolIfChanged,
      openTextEditorAt,
      getSelectedBounds,
      activeStrokesRef,
    ],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const isHardwareEraser = e.button === 5 || (e.buttons & 32) === 32;
      if (e.pointerType === "pen") {
        if (isHardwareEraser) setToolIfChanged("eraser");
        else if (
          toolRef.current !== "shape" &&
          toolRef.current !== "text" &&
          toolRef.current !== "select"
        )
          setToolIfChanged("pen");
      } else if (isHardwareEraser) {
        setToolIfChanged("eraser");
      }

      if (e.buttons === 0) return;
      e.preventDefault();

      const selectionDrag = selectionDragRef.current;
      if (selectionDrag) {
        const selectionState = selectionRef.current;
        if (!selectionState || selectionState.mode !== modeRef.current) return;
        const pt = getXY(e);
        const dx = pt.x - selectionDrag.start.x;
        const dy = pt.y - selectionDrag.start.y;
        const selected = new Set(selectionState.indexes);
        const moved = selectionDrag.original.map((stroke, index) =>
          selected.has(index) ? translateStroke(stroke, dx, dy) : stroke,
        );
        if (modeRef.current === "overlay") {
          overlayDirtyRef.current = true;
          setOverlayStrokes(moved);
        } else {
          setBoardStrokes(moved);
        }
        requestCanvasRender();
        return;
      }

      const existing = currentStrokeRef.current;
      if (!existing) return;

      let baseStroke = rawStrokeRef.current ?? existing;
      const beforeLength = baseStroke.points.length;
      const nativeEvent = e.nativeEvent as PointerEvent;
      const coalesced =
        typeof nativeEvent.getCoalescedEvents === "function"
          ? nativeEvent.getCoalescedEvents()
          : [];
      const samples = coalesced.length > 0 ? coalesced : [nativeEvent];
      const pointStep =
        baseStroke.tool === "eraser"
          ? 1.25
          : toolRef.current === "shape"
            ? 0.9
            : penKindRef.current === "pencil"
              ? 0.75
              : 0.45;

      for (const sample of samples) {
        const pt = getPointFromClient(
          sample.clientX,
          sample.clientY,
          sample.pressure,
        );
        const last = baseStroke.points[baseStroke.points.length - 1];
        const dist = Math.hypot(pt.x - last.x, pt.y - last.y);
        if (dist < pointStep) continue;
        baseStroke.points.push(pt);
      }

      if (baseStroke.points.length === beforeLength) return;

      if (toolRef.current === "shape") {
        const lastPoint = baseStroke.points[baseStroke.points.length - 1];
        const rawShape = {
          ...baseStroke,
          points: [baseStroke.points[0], lastPoint],
          snapShape: shapeKind,
        };
        rawStrokeRef.current = rawShape;
        currentStrokeRef.current = buildShapeStroke(
          rawShape,
          lastPoint,
          shapeKind,
        );
      } else {
        baseStroke.snapShape = undefined;
        rawStrokeRef.current = baseStroke;
        currentStrokeRef.current = baseStroke;
      }

      requestCanvasRender();
    },
    [getPointFromClient, requestCanvasRender, shapeKind, setToolIfChanged],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      releasePointerCaptureSafely(e.currentTarget, e.pointerId);
      isDrawingRef.current = false;

      if (selectionDragRef.current) {
        selectionDragRef.current = null;
        requestCanvasRender();
        return;
      }

      if (toolRef.current === "select") {
        const lasso = currentStrokeRef.current;
        if (lasso && lasso.points.length >= 3) {
          const selectedIndexes = activeStrokesRef.current
            .map((stroke, index) =>
              strokeTouchesPolygon(stroke, lasso.points) ? index : -1,
            )
            .filter((index) => index >= 0);
          setSelection(
            selectedIndexes.length > 0
              ? { mode: modeRef.current, indexes: selectedIndexes }
              : null,
          );
        }
        currentStrokeRef.current = null;
        rawStrokeRef.current = null;
        setCurrentStroke(null);
        requestCanvasRender();
        return;
      }

      setCurrentStroke((prev) => {
        const strokeToCommit = currentStrokeRef.current ?? prev;
        if (!strokeToCommit) return prev;
        if (modeRef.current === "overlay") overlayDirtyRef.current = true;
        const isStrokeEraser =
          strokeToCommit.tool === "eraser" && eraserMode === "stroke";
        if (isStrokeEraser) {
          const radius = Math.max(
            6,
            eraserScaleToWidth(strokeToCommit.width) / 2,
          );
          if (modeRef.current === "overlay")
            setOverlayStrokes((s) =>
              eraseStrokesByPath(s, strokeToCommit.points, radius),
            );
          else
            setBoardStrokes((s) =>
              eraseStrokesByPath(s, strokeToCommit.points, radius),
            );
        } else {
          if (modeRef.current === "overlay")
            setOverlayStrokes((s) => [...s, strokeToCommit]);
          else setBoardStrokes((s) => [...s, strokeToCommit]);
        }
        currentStrokeRef.current = null;
        rawStrokeRef.current = null;
        requestCanvasRender();
        return null;
      });
    },
    [eraserMode, requestCanvasRender],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      releasePointerCaptureSafely(e.currentTarget, e.pointerId);
      isDrawingRef.current = false;
      selectionDragRef.current = null;
      currentStrokeRef.current = null;
      rawStrokeRef.current = null;
      setCurrentStroke(null);
      requestCanvasRender();
    },
    [requestCanvasRender],
  );

  const pointerHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };

  // Özel imleç: küçük kağıt div'inde pointerleave titremesi yerine global pointermove + rect (tolerans)
  useEffect(() => {
    if (!useCustomCursor) return;
    const EDGE_PAD = 8;
    const clamp = (value: number, min: number, max: number) =>
      Math.min(max, Math.max(min, value));
    const flushCursorState = () => {
      cursorFrameRef.current = null;
      const next = pendingCursorStateRef.current;
      const prev = lastCursorStateRef.current;
      const sameInCanvas = prev.inCanvas === next.inCanvas;
      const samePos =
        prev.pos === next.pos ||
        (!!prev.pos &&
          !!next.pos &&
          Math.abs(prev.pos.x - next.pos.x) < 0.25 &&
          Math.abs(prev.pos.y - next.pos.y) < 0.25);
      if (sameInCanvas && samePos) return;
      lastCursorStateRef.current = next;
      cursorInCanvasRef.current = next.inCanvas;
      cursorPosRef.current = next.pos;
      setCursorInCanvas(next.inCanvas);
      setCursorPos(next.pos);
    };

    const queueCursorState = (
      inCanvas: boolean,
      pos: { x: number; y: number } | null,
    ) => {
      pendingCursorStateRef.current = { inCanvas, pos };
      if (cursorFrameRef.current !== null) return;
      cursorFrameRef.current = window.requestAnimationFrame(flushCursorState);
    };

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
          queueCursorState(false, null);
          return;
        }
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        queueCursorState(true, {
          x: clamp(localX, 0, rect.width),
          y: clamp(localY, 0, rect.height),
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
        queueCursorState(false, null);
        return;
      }
      queueCursorState(true, {
        x: clamp(e.clientX - rect.left, 0, rect.width),
        y: clamp(e.clientY - rect.top, 0, rect.height),
      });
    };

    window.addEventListener("pointermove", syncCursor, { passive: true });
    return () => {
      window.removeEventListener("pointermove", syncCursor);
      if (cursorFrameRef.current !== null) {
        window.cancelAnimationFrame(cursorFrameRef.current);
        cursorFrameRef.current = null;
      }
    };
  }, [useCustomCursor]);

  useEffect(() => {
    if (!useCustomCursor || typeof document === "undefined") return;
    const shouldHideNativeCursor =
      !showSaveDialog &&
      (tool === "pen" || tool === "eraser") &&
      (cursorInCanvas || (isDrawingRef.current && !!currentStroke));

    if (shouldHideNativeCursor) {
      if (bodyCursorBeforeHideRef.current === null) {
        bodyCursorBeforeHideRef.current = document.body.style.cursor;
      }
      document.body.style.cursor = "none";
    } else if (bodyCursorBeforeHideRef.current !== null) {
      document.body.style.cursor = bodyCursorBeforeHideRef.current;
      bodyCursorBeforeHideRef.current = null;
    }

    return () => {
      if (bodyCursorBeforeHideRef.current !== null) {
        document.body.style.cursor = bodyCursorBeforeHideRef.current;
        bodyCursorBeforeHideRef.current = null;
      }
    };
  }, [useCustomCursor, tool, cursorInCanvas, currentStroke, showSaveDialog]);

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
        onTempSave(buildTempSavePayload());
      }
      onClose?.();
    }
  }, [buildTempSavePayload, noSave, onClose, onTempSave]);

  const handleDbSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await saveDrawingMutation.mutateAsync({
        id: questionId,
        data: {
          canvasData: JSON.stringify({ overlay: overlayStrokesRef.current }),
        },
      });
      queryClient.removeQueries({
        queryKey: [`/api/questions/${questionId}/drawing`],
      });
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

  const clearCustomCursor = useCallback(() => {
    if (cursorFrameRef.current !== null) {
      window.cancelAnimationFrame(cursorFrameRef.current);
      cursorFrameRef.current = null;
    }
    const cleared = { inCanvas: false, pos: null };
    pendingCursorStateRef.current = cleared;
    lastCursorStateRef.current = cleared;
    cursorInCanvasRef.current = false;
    cursorPosRef.current = null;
    setCursorInCanvas(false);
    setCursorPos(null);
  }, []);

  // ── Custom cursors (always CSS coords; zoom only affects cursor size) ──
  const penCursorPx = Math.max(
    4,
    Math.min(
      (mode === "overlay"
        ? penScaleToPx(penWidth) * zoom
        : penScaleToPx(penWidth)) * 1.1,
      120,
    ),
  );

  const DotCursor =
    useCustomCursor && tool === "pen" && cursorInCanvas && cursorPos ? (
      <div
        className="absolute pointer-events-none z-[55] rounded-full border border-white/70"
        style={{
          left: cursorPos.x,
          top: cursorPos.y,
          width: penCursorPx,
          height: penCursorPx,
          transform: "translate(-50%, -50%)",
          backgroundColor: color,
          boxShadow:
            "0 10px 24px -10px rgba(15,23,42,0.45), 0 0 0 2px rgba(255,255,255,0.45)",
        }}
      />
    ) : null;

  const eraserRingPx =
    mode === "overlay"
      ? Math.max(10, Math.min(eraserScaleToWidth(eraserWidth) * zoom, 160))
      : Math.max(10, Math.min(eraserScaleToWidth(eraserWidth), 160));

  const EraserCursor =
    useCustomCursor && tool === "eraser" && cursorInCanvas && cursorPos ? (
      <div
        className="absolute pointer-events-none z-[55] rounded-full border-[2px] border-sky-500/80 bg-white/35 backdrop-blur-sm"
        style={{
          left: cursorPos.x,
          top: cursorPos.y,
          width: eraserRingPx,
          height: eraserRingPx,
          transform: "translate(-50%, -50%)",
          boxShadow:
            "0 14px 28px -14px rgba(15,23,42,0.45), inset 0 0 0 1px rgba(255,255,255,0.68)",
        }}
      />
    ) : null;

  // ─────────────────────────────────────────────────────────────────
  // Toolbar
  // ─────────────────────────────────────────────────────────────────
  const Toolbar = (
    <>
      {showPanel && (
        <div
          className={cn(
            "glass-panel flex items-center border-b border-border/60 shrink-0",
            overlayChrome
              ? "flex-wrap items-start gap-x-3 gap-y-1.5 px-2.5 py-1.5 overflow-visible"
              : "flex-nowrap gap-2 px-3 py-2 overflow-x-auto",
          )}
          onPointerEnter={clearCustomCursor}
          onPointerDown={clearCustomCursor}
        >
          {/* Pen / Eraser */}
          <div className="flex items-center gap-1 rounded-[1.2rem] border border-border/60 bg-card/80 p-1 shrink-0">
            <button
              onClick={() => setTool("pen")}
              title="Kalem (P)"
              className={cn(
                "rounded-[0.95rem] p-2 transition-all",
                tool === "pen"
                  ? "bg-primary text-primary-foreground shadow-[0_12px_30px_-18px_hsl(var(--primary)/0.65)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]",
              )}
            >
              <Pen className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setTool("eraser")}
              title="Silgi (E)"
              className={cn(
                "rounded-[0.95rem] p-2 transition-all",
                tool === "eraser"
                  ? "bg-destructive text-destructive-foreground shadow-[0_12px_30px_-18px_hsl(var(--destructive)/0.5)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]",
              )}
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setTool("text")}
              title="Metin ekle"
              className={cn(
                "rounded-[0.95rem] p-2 transition-all",
                tool === "text"
                  ? "bg-primary text-primary-foreground shadow-[0_12px_30px_-18px_hsl(var(--primary)/0.65)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]",
              )}
            >
              <Type className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setTool("select")}
              title="Serbest seç ve taşı"
              className={cn(
                "rounded-[0.95rem] p-2 transition-all",
                tool === "select"
                  ? "bg-sky-500 text-white shadow-[0_12px_30px_-18px_rgba(14,165,233,0.65)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]",
              )}
            >
              <MousePointer2 className="w-3.5 h-3.5" />
            </button>
            {tool === "eraser" && (
              <div className="ml-1 flex items-center gap-1">
                <button
                  onClick={() => setEraserMode("area")}
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[9px] transition-all",
                    eraserMode === "area"
                      ? "bg-destructive text-destructive-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.05]",
                  )}
                >
                  Alan
                </button>
                <button
                  onClick={() => setEraserMode("stroke")}
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[9px] transition-all",
                    eraserMode === "stroke"
                      ? "bg-destructive text-destructive-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.05]",
                  )}
                >
                  Çizgi
                </button>
              </div>
            )}
          </div>

          {/* Kalem türleri */}
          {(tool === "pen" || tool === "shape") && (
            <div className="flex items-center gap-1 rounded-[1.2rem] border border-border/60 bg-card/80 p-1 shrink-0">
              {PEN_KIND_OPTIONS.map(({ id, label, short }) => (
                <button
                  key={id}
                  type="button"
                  title={label}
                  onClick={() => setPenKind(id)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1.5 rounded-[0.95rem] text-[9px] font-medium transition-all whitespace-nowrap",
                    penKind === id
                      ? "bg-primary text-primary-foreground shadow-[0_12px_30px_-18px_hsl(var(--primary)/0.65)]"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]",
                  )}
                >
                  {id === "ballpoint" && (
                    <Pen className="h-2.5 w-2.5 shrink-0" />
                  )}
                  {id === "fountain" && (
                    <Feather className="h-2.5 w-2.5 shrink-0" />
                  )}
                  {id === "pencil" && (
                    <PencilLine className="h-2.5 w-2.5 shrink-0" />
                  )}
                  {id === "brush" && <Brush className="h-2.5 w-2.5 shrink-0" />}
                  <span className="hidden xl:inline">{short}</span>
                </button>
              ))}
            </div>
          )}

          {allowShapeTools &&
            (tool === "pen" || tool === "shape") &&
            (overlayChrome ? (
              <Popover open={shapeToolsOpen} onOpenChange={setShapeToolsOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-1 rounded-[1.2rem] border border-border/60 bg-card/80 px-2.5 py-2 text-[10px] font-medium text-muted-foreground transition-all shrink-0 hover:text-foreground hover:bg-foreground/[0.05]",
                      "order-5",
                      tool === "shape" &&
                        "border-primary/40 bg-primary/10 text-primary",
                    )}
                    title="Şekiller"
                  >
                    <Square className="h-3 w-3 shrink-0" />
                    <span>Şekiller</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  side="bottom"
                  sideOffset={8}
                  className="w-[min(22rem,calc(100vw-2rem))] rounded-[1.25rem] border border-border/70 bg-card/95 p-2.5 shadow-[0_24px_48px_-28px_rgba(15,23,42,0.38)] backdrop-blur-xl"
                >
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {SHAPE_TOOL_OPTIONS.map(
                      ({ id, label, icon: Icon, iconClassName }) => (
                        <button
                          key={id}
                          type="button"
                          title={label}
                          onClick={() => {
                            setTool("shape");
                            setShapeKind(id);
                            setShapeToolsOpen(false);
                          }}
                          className={cn(
                            "flex items-center gap-1 rounded-[0.95rem] px-2.5 py-2 text-[10px] font-medium transition-all whitespace-nowrap",
                            tool === "shape" && shapeKind === id
                              ? "bg-primary text-primary-foreground shadow-[0_12px_30px_-18px_hsl(var(--primary)/0.65)]"
                              : "bg-background/80 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]",
                          )}
                        >
                          <Icon
                            className={cn("h-3 w-3 shrink-0", iconClassName)}
                          />
                          <span>{label}</span>
                        </button>
                      ),
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            ) : (
              <div className="flex items-center gap-1 rounded-[1.2rem] border border-border/60 bg-card/80 p-1 shrink-0">
                {SHAPE_TOOL_OPTIONS.map(
                  ({ id, label, icon: Icon, iconClassName }) => (
                    <button
                      key={id}
                      type="button"
                      title={label}
                      onClick={() => {
                        setTool("shape");
                        setShapeKind(id);
                      }}
                      className={cn(
                        "flex items-center gap-1 rounded-[0.95rem] px-2 py-1.5 text-[9px] font-medium transition-all whitespace-nowrap",
                        tool === "shape" && shapeKind === id
                          ? "bg-primary text-primary-foreground shadow-[0_12px_30px_-18px_hsl(var(--primary)/0.65)]"
                          : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]",
                      )}
                    >
                      <Icon
                        className={cn("h-2.5 w-2.5 shrink-0", iconClassName)}
                      />
                      <span className="hidden xl:inline">{label}</span>
                    </button>
                  ),
                )}
              </div>
            ))}

          {/* Colors */}
          <div
            className={cn(
              "flex items-center gap-1 rounded-[1.2rem] border border-border/60 bg-card/80 px-1.5 py-1 shrink-0",
              overlayChrome && "order-7",
            )}
          >
            {COLORS.map((c) => (
              <button
                key={c.hex}
                onClick={() => {
                  setColor(c.hex);
                  if (tool !== "shape" && tool !== "text") setTool("pen");
                }}
                title={c.name}
                style={{ backgroundColor: c.hex }}
                className={cn(
                  "h-4.5 w-4.5 rounded-full border transition-all hover:scale-110",
                  (tool === "pen" || tool === "shape" || tool === "text") &&
                    color === c.hex
                    ? "border-foreground scale-[1.14] shadow-[0_10px_18px_-10px_rgba(15,23,42,0.45)]"
                    : "border-white/70",
                )}
              />
            ))}
          </div>

          {/* Kalınlık 1–100 */}
          {(tool === "pen" || tool === "shape" || tool === "text") && (
            <div
              className={cn(
                "flex min-w-[128px] max-w-[184px] items-center gap-1 shrink-0",
                overlayChrome && "order-3 mt-1.5",
              )}
            >
              <span className="w-5 tabular-nums text-[9px] text-muted-foreground">
                {penWidth}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 rounded-md"
                onClick={() => setPenWidth(Math.max(1, penWidth - 1))}
              >
                -
              </Button>
              <Slider
                min={1}
                max={18}
                step={1}
                value={[penWidth]}
                onValueChange={(v) => setPenWidth(v[0] ?? 35)}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 rounded-md"
                onClick={() => setPenWidth(Math.min(18, penWidth + 1))}
              >
                +
              </Button>
            </div>
          )}
          {tool === "eraser" && (
            <div
              className={cn(
                "flex min-w-[128px] max-w-[184px] items-center gap-1 shrink-0",
                overlayChrome && "order-3 mt-1.5",
              )}
            >
              <span className="w-5 tabular-nums text-[9px] text-muted-foreground">
                {eraserWidth}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 rounded-md"
                onClick={() => setEraserWidth(Math.max(1, eraserWidth - 1))}
              >
                -
              </Button>
              <Slider
                min={1}
                max={100}
                step={1}
                value={[eraserWidth]}
                onValueChange={(v) => setEraserWidth(v[0] ?? 35)}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 rounded-md"
                onClick={() => setEraserWidth(Math.min(100, eraserWidth + 1))}
              >
                +
              </Button>
            </div>
          )}

          {/* Separate mode image scale */}
          {mode === "separate" && imageUrl && (
            <div className="flex items-center gap-1 rounded-[1.2rem] border border-border/60 bg-card/80 p-1 shrink-0">
              {[1, 1.15, 1.3, 1.5].map((z) => (
                <button
                  key={z}
                  onClick={() => setSeparateImageScale(z)}
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[9px] transition-all",
                    Math.abs(separateImageScale - z) < 0.01
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.05]",
                  )}
                >
                  {Math.round(z * 100)}%
                </button>
              ))}
            </div>
          )}

          {/* Zoom controls — overlay mode only */}
          {mode === "overlay" && (
            <div
              className={cn(
                "flex items-center gap-0.5 rounded-[1.2rem] border border-border/60 bg-card/80 p-1 shrink-0",
                overlayChrome && "order-4",
              )}
            >
              <button
                onClick={() => applyZoom(zoom / 1.25)}
                title="Uzaklaş (Ctrl −)"
                className="rounded-md p-0.5 text-muted-foreground transition-all hover:bg-foreground/[0.05] hover:text-foreground disabled:opacity-30"
                disabled={zoom <= MIN_ZOOM}
              >
                <ZoomOut className="h-3 w-3" />
              </button>
              <span className="w-7 select-none text-center tabular-nums text-[9px] text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => applyZoom(zoom * 1.25)}
                title="Yaklaş (Ctrl +)"
                className="rounded-md p-0.5 text-muted-foreground transition-all hover:bg-foreground/[0.05] hover:text-foreground disabled:opacity-30"
                disabled={zoom >= MAX_ZOOM}
              >
                <ZoomIn className="h-3 w-3" />
              </button>
              <button
                onClick={() => applyZoom(computeFitZoom())}
                title="Sayfaya sığdır (Ctrl 0)"
                className="rounded-md p-1 text-muted-foreground transition-all hover:bg-foreground/[0.05] hover:text-foreground"
              >
                <Maximize2 className="h-3 w-3" />
              </button>
            </div>
          )}

          {overlayChrome && <div className="order-6 basis-full h-0.5" />}

          {/* Undo / Clear */}
          <div
            className={cn(
              "flex items-center gap-1.5 shrink-0",
              overlayChrome ? "order-8 justify-start" : "ml-auto",
            )}
          >
            <button
              onClick={() => {
                setSelection(null);
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
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition-all hover:bg-foreground/[0.05] hover:text-foreground disabled:opacity-30"
            >
              <Undo2 className="h-3 w-3" /> Geri Al
            </button>
            <button
              onClick={() => {
                if (activeStrokes.length > 0) {
                  setSelection(null);
                  if (mode === "overlay") overlayDirtyRef.current = true;
                  setUndoHistory((p) => [...p, activeStrokes]);
                  setActiveStrokes([]);
                }
              }}
              disabled={activeStrokes.length === 0}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-destructive/80 transition-all hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
            >
              <Trash2 className="h-3 w-3" /> Temizle
            </button>
          </div>

          {!overlayChrome && (
            <div className="hidden text-[10px] text-muted-foreground/80 lg:block">
              Zoom: Ctrl + tekerlek · Kaydır: tekerlek / çubuk (Ctrl olmadan)
            </div>
          )}
        </div>
      )}
    </>
  );

  const renderTextEditor = (editor: TextEditorState) => {
    const scaledFontSize =
      editor.mode === "overlay"
        ? textFontSizeFromWidth(penWidth) * zoom
        : textFontSizeFromWidth(penWidth);
    const fontSize = Math.max(13, scaledFontSize);
    const handleBase =
      "absolute z-[2] h-3 w-3 rounded-full border border-slate-400/70 bg-white/80 shadow-[0_8px_18px_-12px_rgba(15,23,42,0.7)] dark:border-white/35 dark:bg-slate-900/90";

    return (
      <div
        className="absolute z-[60] rounded-xl border border-dashed border-slate-500/65 bg-transparent shadow-[0_18px_42px_-28px_rgba(15,23,42,0.65)] ring-1 ring-white/25"
        style={{
          left: editor.cssX,
          top: editor.cssY,
          width: editor.cssWidth,
          height: editor.cssHeight,
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div
          role="button"
          aria-label="Metin kutusunu taşı"
          className="absolute -top-4 left-1/2 z-[3] h-3 w-20 -translate-x-1/2 cursor-move rounded-full border border-slate-400/45 bg-white/45 shadow-[0_8px_18px_-14px_rgba(15,23,42,0.65)] backdrop-blur-sm dark:border-white/20 dark:bg-slate-900/45"
          onPointerDown={beginTextEditorMove}
        />
        <textarea
          autoFocus
          value={editor.value}
          onChange={(event) =>
            setTextEditor((current) =>
              current ? { ...current, value: event.target.value } : current,
            )
          }
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              commitTextEditor(false);
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              commitTextEditor(true);
            }
          }}
          onBlur={() => commitTextEditor(true)}
          placeholder="Metin yaz..."
          className="h-full w-full resize-none rounded-xl border-0 bg-transparent px-3 py-2 font-semibold outline-none placeholder:text-slate-500/60 dark:placeholder:text-white/35"
          style={{
            color,
            caretColor: color,
            fontSize,
            lineHeight: 1.22,
          }}
        />
        <span
          className={cn(handleBase, "-left-1.5 -top-1.5 cursor-nwse-resize")}
          onPointerDown={(event) => beginTextEditorResize(event, "nw")}
        />
        <span
          className={cn(handleBase, "-right-1.5 -top-1.5 cursor-nesw-resize")}
          onPointerDown={(event) => beginTextEditorResize(event, "ne")}
        />
        <span
          className={cn(handleBase, "-bottom-1.5 -left-1.5 cursor-nesw-resize")}
          onPointerDown={(event) => beginTextEditorResize(event, "sw")}
        />
        <span
          className={cn(
            handleBase,
            "-bottom-1.5 -right-1.5 cursor-nwse-resize",
          )}
          onPointerDown={(event) => beginTextEditorResize(event, "se")}
        />
      </div>
    );
  };

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
          style={{
            position: "absolute",
            width: 0,
            height: 0,
            opacity: 0,
            pointerEvents: "none",
          }}
          onLoad={() => {
            setImgLoaded(true);
            updateImgLayout();
            renderOverlay();
          }}
        />
      )}

      <div
        className={cn(
          "flex w-full flex-col bg-background select-none",
          overlayChrome && !imageUrl
            ? "h-auto overflow-visible"
            : "h-full overflow-hidden",
        )}
      >
        {/* Top bar */}
        {!overlayChrome && (
          <div
            className={cn(
              "glass-panel z-10 flex flex-nowrap items-center gap-2 border-b border-border/60 px-3 py-1.5 overflow-x-auto",
              overlayChrome
                ? "shrink-0 rounded-t-2xl border-x border-t bg-background/92 backdrop-blur-xl"
                : "shrink-0",
            )}
          >
            <button
              onClick={handleClose}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
            >
              ← Kapat
            </button>

            {imageUrl && (
              <div className="flex items-center gap-0.5 rounded-[1.2rem] border border-border/60 bg-card/82 p-0.5 shrink-0">
                <button
                  onClick={() => setMode("overlay")}
                  title="Resim üzerinde çiz"
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 rounded-[0.95rem] text-[10px] font-medium transition-all",
                    mode === "overlay"
                      ? "bg-primary text-primary-foreground shadow-[0_12px_30px_-18px_hsl(var(--primary)/0.65)]"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]",
                  )}
                >
                  <ImageIcon className="h-3 w-3" />
                  <span className="hidden sm:inline">Resim Üstünde</span>
                </button>
                <button
                  onClick={() => setMode("separate")}
                  title="Müsvedde — çizimler kaydedilmez"
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 rounded-[0.95rem] text-[10px] font-medium transition-all",
                    mode === "separate"
                      ? "bg-secondary text-secondary-foreground shadow-[0_12px_30px_-22px_rgba(15,23,42,0.35)]"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]",
                  )}
                >
                  <PenLine className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Müsvedde</span>
                </button>
              </div>
            )}

            {imageUrl && (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
                <span title="Kayıtlı çizim (resim üstü)">
                  <ImageIcon className="w-3 h-3 inline mr-0.5" />
                  {overlayStrokes.length}
                </span>
                <span title="Müsvedde — kaydedilmez">
                  <PenLine className="w-3 h-3 inline mr-0.5 opacity-60" />
                  {boardStrokes.length}
                </span>
              </div>
            )}

            <div className="flex-1" />
            {!noSave && (
              <Button
                size="sm"
                onClick={handleDbSave}
                disabled={isSaving}
                className="shrink-0 gap-2 rounded-full"
              >
                <Save className="w-4 h-4" />
                {isSaving ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            )}
            {!overlayChrome && (
              <button
                onClick={() => setShowPanel((p) => !p)}
                className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                title="Araç çubuğunu gizle/göster"
              >
                {showPanel ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        )}

        {/* Toolbar */}
        <div
          className={cn(
            "z-20 bg-background",
            overlayChrome
              ? "shrink-0 rounded-b-2xl border-x border-b border-border/60 bg-background/92 backdrop-blur-xl"
              : "shrink-0",
          )}
        >
          {overlayChrome || showPanel ? Toolbar : null}
        </div>

        {/* ── OVERLAY mode: scrollable paper with zoom ── */}
        {mode === "overlay" ? (
          <div
            ref={scrollViewRef}
            className="min-h-0 flex-1 overflow-auto bg-background"
            style={{ position: "relative", overscrollBehavior: "contain" }}
          >
            <div className="flex w-max min-w-full min-h-full justify-center items-start box-border p-6">
              <div
                ref={overlayPaperRef}
                style={{
                  position: "relative",
                  width: PAPER_W * zoom,
                  height: PAPER_H * zoom,
                  flexShrink: 0,
                  cursor:
                    useCustomCursor &&
                    !showSaveDialog &&
                    (tool === "pen" || tool === "eraser")
                      ? "none"
                      : "crosshair",
                  touchAction: "none",
                  filter: "drop-shadow(0 32px 48px rgba(15, 23, 42, 0.12))",
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
                {textEditor?.mode === "overlay" && renderTextEditor(textEditor)}

                {/* Loading state */}
                {!imgLoaded && imageUrl && (
                  <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    style={{ top: 0, left: 0, width: "100%", height: "100%" }}
                  >
                    <div className="text-sm text-muted-foreground">
                      Yükleniyor…
                    </div>
                  </div>
                )}

                {/* Image position label */}
                {imgLoaded && imageUrl && (
                  <div
                    className="absolute pointer-events-none text-[10px] font-medium text-muted-foreground/80"
                    style={{
                      left: imgLayoutRef.current.x * zoom,
                      top:
                        (imgLayoutRef.current.y + imgLayoutRef.current.h + 6) *
                        zoom,
                    }}
                  >
                    ↑ Soru · Yanları ve altı çizim alanı
                  </div>
                )}

                {!imageUrl && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-sm text-muted-foreground">
                      Çizmeye başla
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ── SEPARATE mode: image left, canvas right ── */
          <div
            ref={splitWrapRef}
            className={cn(
              "flex overflow-hidden",
              overlayChrome && !imageUrl
                ? "aspect-square w-full flex-none"
                : "flex-1",
            )}
          >
            {imageUrl && (
              <div
                className="flex items-start justify-center overflow-auto border-r border-border/40 bg-secondary/35 p-5 shrink-0"
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
                className="w-2 shrink-0 cursor-col-resize bg-border/50 hover:bg-sky-400/50 transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsResizingSplit(true);
                }}
                title="Soru alanını daralt/genişlet"
              />
            )}
            <div
              ref={containerRef}
              className={cn(
                "relative flex-1 min-w-0 overflow-hidden bg-card/55",
                imageUrl ? "rounded-l-[1.5rem]" : "rounded-2xl",
              )}
              style={{
                cursor:
                  useCustomCursor &&
                  !showSaveDialog &&
                  (tool === "pen" || tool === "eraser")
                    ? "none"
                    : "crosshair",
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.04]"
                style={{
                  backgroundImage: `linear-gradient(rgba(148,163,184,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.16) 1px, transparent 1px)`,
                  backgroundSize: "40px 40px",
                }}
              />
              <canvas
                ref={boardCanvasRef}
                className="absolute inset-0 block h-full w-full touch-none"
                style={{ touchAction: "none" }}
                {...pointerHandlers}
              />
              {DotCursor}
              {EraserCursor}
              {textEditor?.mode === "separate" && renderTextEditor(textEditor)}
              {activeStrokes.length === 0 && !overlayChrome && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <Pen className="mb-2 h-10 w-10 text-muted-foreground/30" />
                  <p className="px-4 text-center text-sm text-muted-foreground">
                    {noSave
                      ? "Geçici müsvedde — kayıt yok"
                      : "Müsvedde — kapatınca silinir, kaydedilmez"}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Unsaved Changes Dialog */}
      <Dialog
        open={showSaveDialog}
        onOpenChange={(open) => {
          if (!open) setShowSaveDialog(false);
        }}
      >
        <DialogContent className="max-w-md mx-auto">
          <DialogTitle className="text-lg font-semibold">
            Değişiklikleri Kaydet
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Kaydedilmemiş çizim değişiklikleri var. Çıkmadan önce ne yapmak
            istersiniz?
          </DialogDescription>
          <div className="py-2">
            <div className="flex gap-3">
              <Button
                onClick={handleSaveAndClose}
                disabled={isSaving}
                className="flex-1"
              >
                {isSaving ? "Kaydediliyor..." : "Kaydet ve Çık"}
              </Button>
              <Button
                variant="outline"
                onClick={handleDiscardAndClose}
                className="flex-1"
              >
                Kaydetme
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

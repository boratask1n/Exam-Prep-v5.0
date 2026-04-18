import { getStroke, type StrokeOptions } from "perfect-freehand";

export type DrawingTool = "pen" | "eraser" | "text";
export type DrawingPenKind = "ballpoint" | "fountain" | "pencil" | "brush";

export interface DrawingPoint {
  x: number;
  y: number;
  pressure?: number;
}

export interface DrawingStroke {
  tool: DrawingTool;
  color: string;
  width: number;
  points: DrawingPoint[];
  penKind?: DrawingPenKind;
  snapShape?: string;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  boxWidth?: number;
  boxHeight?: number;
}

type RenderWidthMode = "scale" | "raw";
type FreehandInputPoint = [number, number, number];

interface RenderOptions {
  widthMode?: RenderWidthMode;
  cache?: boolean;
}

const pathCache = new WeakMap<DrawingStroke, Map<string, Path2D>>();
const monolinePathCache = new WeakMap<DrawingStroke, Map<string, Path2D>>();

export function curvePressure(raw: number): number {
  const pressure = Math.min(1, Math.max(0.05, raw || 0.5));
  return Math.pow(pressure, 0.64);
}

export function penScaleToPx(scale: number): number {
  const s = Math.min(100, Math.max(1, scale));
  return 0.35 + (s / 100) * 39.65;
}

export function eraserScaleToWidth(scale: number): number {
  const s = Math.min(100, Math.max(1, scale));
  return 4 + (s / 100) * 30;
}

function resolvePenWidth(stroke: DrawingStroke, widthMode: RenderWidthMode) {
  return widthMode === "raw"
    ? Math.max(0.75, stroke.width)
    : penScaleToPx(stroke.width);
}

function resolveEraserWidth(stroke: DrawingStroke, widthMode: RenderWidthMode) {
  return widthMode === "raw"
    ? Math.max(4, stroke.width)
    : eraserScaleToWidth(stroke.width);
}

function freehandOptions(
  stroke: DrawingStroke,
  widthMode: RenderWidthMode,
): StrokeOptions {
  const kind = stroke.penKind ?? "ballpoint";
  const baseWidth = resolvePenWidth(stroke, widthMode);
  const size =
    kind === "brush"
      ? baseWidth * 1.14
      : kind === "fountain"
        ? baseWidth * 0.98
        : kind === "pencil"
          ? baseWidth * 0.86
          : baseWidth * 0.9;

  return {
    size: Math.max(1.1, size),
    thinning:
      kind === "brush"
        ? 0.52
        : kind === "fountain"
          ? 0.34
          : kind === "pencil"
            ? 0.06
            : 0.005,
    smoothing: kind === "ballpoint" ? 0.94 : 0.86,
    streamline: kind === "ballpoint" ? 0.72 : 0.58,
    simulatePressure: kind === "brush" || kind === "fountain",
    easing: (pressure) => Math.pow(Math.max(0.02, pressure), 0.86),
    start: { cap: true, taper: false },
    end: { cap: true, taper: false },
    last: true,
  };
}

function smoothPoints(points: DrawingPoint[]) {
  if (points.length < 3) return points;
  const passes = points.length > 520 ? 1 : points.length > 260 ? 2 : 3;
  let current = points;

  for (let pass = 0; pass < passes; pass++) {
    const next = current.map((point) => ({ ...point }));
    for (let i = 1; i < current.length - 1; i++) {
      const prev = current[i - 1];
      const point = current[i];
      const after = current[i + 1];
      next[i] = {
        x: point.x * 0.62 + ((prev.x + after.x) / 2) * 0.38,
        y: point.y * 0.62 + ((prev.y + after.y) / 2) * 0.38,
        pressure:
          (point.pressure ?? 0.5) * 0.68 +
          (((prev.pressure ?? 0.5) + (after.pressure ?? 0.5)) / 2) * 0.32,
      };
    }
    current = next;
  }

  return current;
}

function softenCorners(points: DrawingPoint[], iterations: number) {
  if (points.length < 3 || iterations <= 0) return points;

  let current = points;
  for (let pass = 0; pass < iterations; pass++) {
    if (current.length < 3) break;

    const next: DrawingPoint[] = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      const point = current[i];
      const after = current[i + 1];
      const pressure = point.pressure ?? 0.5;
      const afterPressure = after.pressure ?? pressure;

      next.push({
        x: point.x * 0.72 + after.x * 0.28,
        y: point.y * 0.72 + after.y * 0.28,
        pressure: pressure * 0.72 + afterPressure * 0.28,
      });
      next.push({
        x: point.x * 0.28 + after.x * 0.72,
        y: point.y * 0.28 + after.y * 0.72,
        pressure: pressure * 0.28 + afterPressure * 0.72,
      });
    }
    next.push(current[current.length - 1]);
    current = next;
  }

  return current;
}

function interpolatePoints(points: DrawingPoint[], maxStep: number) {
  if (points.length < 2) return points;

  const out: DrawingPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const next = points[i];
    const dist = Math.hypot(next.x - prev.x, next.y - prev.y);
    const steps = Math.min(5, Math.max(1, Math.ceil(dist / maxStep)));

    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      out.push({
        x: prev.x + (next.x - prev.x) * t,
        y: prev.y + (next.y - prev.y) * t,
        pressure:
          (prev.pressure ?? 0.5) +
          ((next.pressure ?? 0.5) - (prev.pressure ?? 0.5)) * t,
      });
    }
  }

  return out;
}

function toFreehandInputPoints(
  stroke: DrawingStroke,
  cache: boolean,
): FreehandInputPoint[] {
  const kind = stroke.penKind ?? "ballpoint";
  const maxStep = cache ? 1.25 : stroke.points.length > 520 ? 1.9 : 1.35;
  const cornerPasses = stroke.points.length > 420 ? 1 : 2;
  const prepared = interpolatePoints(
    softenCorners(smoothPoints(stroke.points), cornerPasses),
    maxStep,
  );

  return prepared.map((point) => [
    point.x,
    point.y,
    kind === "ballpoint" ? 0.72 : (point.pressure ?? 0.5),
  ]);
}

function strokeCacheKey(stroke: DrawingStroke, widthMode: RenderWidthMode) {
  return [
    widthMode,
    stroke.tool,
    stroke.color,
    stroke.width,
    stroke.penKind ?? "ballpoint",
    stroke.snapShape ?? "freehand",
    stroke.points.length,
  ].join("|");
}

function createMonolinePath(stroke: DrawingStroke, cache: boolean): Path2D {
  const path = new Path2D();
  const cornerPasses = stroke.points.length > 420 ? 2 : 3;
  const points = interpolatePoints(
    softenCorners(smoothPoints(stroke.points), cornerPasses),
    cache ? 0.9 : 0.75,
  );

  if (points.length === 0) return path;
  if (points.length === 1) {
    path.arc(points[0].x, points[0].y, 0.5, 0, Math.PI * 2);
    return path;
  }

  path.moveTo(points[0].x, points[0].y);

  if (points.length === 2) {
    path.lineTo(points[1].x, points[1].y);
    return path;
  }

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    path.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    );
  }

  return path;
}

function getMonolinePath(
  stroke: DrawingStroke,
  widthMode: RenderWidthMode,
  cache: boolean,
) {
  if (!cache) return createMonolinePath(stroke, cache);

  const key = `monoline|${strokeCacheKey(stroke, widthMode)}`;
  const cachedByKey = monolinePathCache.get(stroke);
  const cached = cachedByKey?.get(key);
  if (cached) return cached;

  const path = createMonolinePath(stroke, cache);
  const nextByKey = cachedByKey ?? new Map<string, Path2D>();
  nextByKey.set(key, path);
  if (!cachedByKey) monolinePathCache.set(stroke, nextByKey);
  return path;
}

function createFreehandPath(
  stroke: DrawingStroke,
  options: StrokeOptions,
  cache: boolean,
): Path2D {
  const outline = getStroke(toFreehandInputPoints(stroke, cache), options);
  const path = new Path2D();

  if (outline.length < 3) {
    const first = stroke.points[0];
    const size = Math.max(1, Number(options.size ?? stroke.width));
    if (first) path.arc(first.x, first.y, size / 2, 0, Math.PI * 2);
    return path;
  }

  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length - 1; i++) {
    const current = outline[i];
    const next = outline[i + 1];
    path.quadraticCurveTo(
      current[0],
      current[1],
      (current[0] + next[0]) / 2,
      (current[1] + next[1]) / 2,
    );
  }
  path.closePath();
  return path;
}

function getFreehandPath(
  stroke: DrawingStroke,
  widthMode: RenderWidthMode,
  cache: boolean,
) {
  const options = freehandOptions(stroke, widthMode);
  if (!cache) return createFreehandPath(stroke, options, cache);

  const key = strokeCacheKey(stroke, widthMode);
  const cachedByKey = pathCache.get(stroke);
  const cached = cachedByKey?.get(key);
  if (cached) return cached;

  const path = createFreehandPath(stroke, options, cache);
  const nextByKey = cachedByKey ?? new Map<string, Path2D>();
  nextByKey.set(key, path);
  if (!cachedByKey) pathCache.set(stroke, nextByKey);
  return path;
}

function drawCenterline(
  ctx: CanvasRenderingContext2D,
  points: DrawingPoint[],
  width: number,
  color: string,
) {
  if (points.length === 0) return;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, Math.max(1, width / 2), 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

function renderShapeStroke(
  ctx: CanvasRenderingContext2D,
  stroke: DrawingStroke,
  widthMode: RenderWidthMode,
) {
  const width = resolvePenWidth(stroke, widthMode);
  const points = stroke.points;
  if (points.length === 0) return;

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;

  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, Math.max(1, width / 2), 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (stroke.snapShape === "circle") {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rx = Math.max(1, (maxX - minX) / 2);
    const ry = Math.max(1, (maxY - minY) / 2);

    ctx.beginPath();
    ctx.ellipse(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      rx,
      ry,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  if (stroke.snapShape !== "line" && points.length > 2) {
    ctx.closePath();
  }
  ctx.stroke();
}

function renderFreehandStroke(
  ctx: CanvasRenderingContext2D,
  stroke: DrawingStroke,
  widthMode: RenderWidthMode,
  cache: boolean,
) {
  const path = getFreehandPath(stroke, widthMode, cache);
  ctx.fillStyle = stroke.color;
  ctx.fill(path);
}

function renderMonolineStroke(
  ctx: CanvasRenderingContext2D,
  stroke: DrawingStroke,
  widthMode: RenderWidthMode,
  cache: boolean,
) {
  const width = Math.max(1.05, resolvePenWidth(stroke, widthMode) * 0.92);
  const path = getMonolinePath(stroke, widthMode, cache);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;

  if (stroke.points.length === 1) {
    ctx.beginPath();
    ctx.arc(stroke.points[0].x, stroke.points[0].y, width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.stroke(path);
}

function renderEraserStroke(
  ctx: CanvasRenderingContext2D,
  stroke: DrawingStroke,
  widthMode: RenderWidthMode,
) {
  ctx.globalCompositeOperation = "destination-out";
  drawCenterline(
    ctx,
    stroke.points,
    resolveEraserWidth(stroke, widthMode),
    "#000000",
  );
}

function renderTextStroke(
  ctx: CanvasRenderingContext2D,
  stroke: DrawingStroke,
) {
  const anchor = stroke.points[0];
  const text = stroke.text?.trim();
  if (!anchor || !text) return;

  const fontSize = Math.max(12, stroke.fontSize ?? 26 + stroke.width * 2);
  const fontFamily =
    stroke.fontFamily ??
    '"SF Pro Display", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const lineHeight = fontSize * 1.22;

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = stroke.color;
  ctx.font = `600 ${fontSize}px ${fontFamily}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  const maxWidth =
    stroke.boxWidth && stroke.boxWidth > fontSize ? stroke.boxWidth : null;
  const lines = maxWidth
    ? text.split(/\r?\n/).flatMap((line) => wrapTextLine(ctx, line, maxWidth))
    : text.split(/\r?\n/);

  lines.forEach((line, index) => {
    ctx.fillText(line, anchor.x, anchor.y + index * lineHeight);
  });
}

function wrapTextLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  maxWidth: number,
) {
  if (!line.trim()) return [""];
  const words = line.split(/\s+/);
  const wrapped: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    wrapped.push(current);
    current = word;
  }

  if (current) wrapped.push(current);
  return wrapped;
}

export function renderDrawingStroke(
  ctx: CanvasRenderingContext2D,
  stroke: DrawingStroke,
  options: RenderOptions = {},
) {
  if (stroke.points.length === 0) return;

  const widthMode = options.widthMode ?? "scale";
  const cache = options.cache ?? true;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (stroke.tool === "text") {
    renderTextStroke(ctx, stroke);
    ctx.restore();
    return;
  }

  if (stroke.tool === "eraser") {
    renderEraserStroke(ctx, stroke, widthMode);
    ctx.restore();
    return;
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = stroke.penKind === "pencil" ? 0.86 : 1;

  if (stroke.snapShape && stroke.points.length >= 2) {
    renderShapeStroke(ctx, stroke, widthMode);
    ctx.restore();
    return;
  }

  renderFreehandStroke(ctx, stroke, widthMode, cache);
  ctx.restore();
}

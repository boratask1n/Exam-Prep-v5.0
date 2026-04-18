import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { renderDrawingStroke } from "@/lib/drawing-engine";

export type CanvasPreviewPoint = { x: number; y: number; pressure?: number };
export type CanvasPreviewStroke = {
  tool: "pen" | "eraser" | "text";
  color: string;
  width: number;
  points: CanvasPreviewPoint[];
  penKind?: "ballpoint" | "fountain" | "pencil" | "brush";
  snapShape?: string;
  text?: string;
  fontSize?: number;
  boxWidth?: number;
  boxHeight?: number;
};

export type CanvasPreviewBounds = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

function getStrokePreviewPoints(
  stroke: CanvasPreviewStroke,
): CanvasPreviewPoint[] {
  if (stroke.tool === "eraser") return [];
  if (stroke.tool !== "text") return stroke.points;

  const anchor = stroke.points[0];
  if (!anchor) return [];
  const fontSize = stroke.fontSize ?? 28;
  const lines = (stroke.text || "Metin").split(/\r?\n/);
  const maxLineLength = Math.max(...lines.map((line) => line.length), 1);
  const textWidth =
    stroke.boxWidth ??
    Math.max(fontSize * 1.8, maxLineLength * fontSize * 0.58);
  const textHeight =
    stroke.boxHeight ?? Math.max(fontSize, lines.length * fontSize * 1.22);

  return [anchor, { x: anchor.x + textWidth, y: anchor.y + textHeight }];
}

export function getCanvasPreviewBounds(
  strokes: CanvasPreviewStroke[],
  paddingRatio = 0.045,
): CanvasPreviewBounds | null {
  const points = strokes.flatMap(getStrokePreviewPoints);
  if (points.length === 0) return null;

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const padding = Math.max(6, Math.max(width, height) * paddingRatio);

  return {
    minX: minX - padding,
    minY: minY - padding,
    width: width + padding * 2,
    height: height + padding * 2,
  };
}

export function CanvasStrokePreview({
  strokes,
  title,
  className,
  canvasClassName,
  style,
  boundsOverride,
  maxContentZoom = 1,
  paddingRatio = 0.045,
  inset = 6,
}: {
  strokes: CanvasPreviewStroke[];
  title: string;
  className: string;
  canvasClassName: string;
  style?: CSSProperties;
  boundsOverride?: CanvasPreviewBounds | null;
  maxContentZoom?: number;
  paddingRatio?: number;
  inset?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contentBounds = useMemo(
    () => getCanvasPreviewBounds(strokes, paddingRatio),
    [paddingRatio, strokes],
  );
  const bounds = useMemo(
    () => boundsOverride ?? contentBounds,
    [boundsOverride, contentBounds],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent || !bounds) return;

    const render = () => {
      const rect = parent.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const innerWidth = Math.max(1, rect.width - inset * 2);
      const innerHeight = Math.max(1, rect.height - inset * 2);
      const baseScale = Math.min(
        innerWidth / bounds.width,
        innerHeight / bounds.height,
      );

      let renderBounds = bounds;
      let scale = baseScale;
      if (boundsOverride && contentBounds && maxContentZoom > 1) {
        const contentScale = Math.min(
          innerWidth / contentBounds.width,
          innerHeight / contentBounds.height,
        );
        const cappedContentScale = Math.min(
          contentScale,
          baseScale * maxContentZoom,
        );
        if (cappedContentScale > baseScale) {
          renderBounds = contentBounds;
          scale = cappedContentScale;
        }
      }

      const offsetX =
        (rect.width - renderBounds.width * scale) / 2 -
        renderBounds.minX * scale;
      const offsetY =
        (rect.height - renderBounds.height * scale) / 2 -
        renderBounds.minY * scale;

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);
      for (const stroke of strokes) {
        renderDrawingStroke(ctx, stroke, { widthMode: "scale", cache: false });
      }
      ctx.restore();
    };

    render();
    const observer = new ResizeObserver(render);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [bounds, boundsOverride, contentBounds, inset, maxContentZoom, strokes]);

  return (
    <div className={className} style={style}>
      <canvas
        ref={canvasRef}
        aria-label={`${title} çizim önizleme`}
        className={canvasClassName}
      />
    </div>
  );
}

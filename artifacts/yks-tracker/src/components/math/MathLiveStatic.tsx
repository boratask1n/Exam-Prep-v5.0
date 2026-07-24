import { createElement, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { convertLegacyMathValueToLatex } from "./mathExpression";

type MathSpanElement = HTMLElement & {
  render?: () => Promise<void> | void;
};

type MathLiveStaticProps = {
  value: string;
  className?: string;
};

export function MathLiveStatic({ value, className }: MathLiveStaticProps) {
  const spanRef = useRef<MathSpanElement | null>(null);
  const latex = useMemo(() => convertLegacyMathValueToLatex(value), [value]);
  const shouldRenderMath = useMemo(() => {
    const trimmed = latex.trim();
    if (!trimmed) return false;
    return /\\|[_^{}]|[=+\-*/<>]|[0-9]|lim|sin|cos|tan|cot|log|sqrt|frac|int|sum|theta|alpha|beta|pi|infty/i.test(
      trimmed,
    );
  }, [latex]);

  useEffect(() => {
    const element = spanRef.current;
    if (!element || !shouldRenderMath) return;
    element.textContent = `\\displaystyle ${latex}`;
    void element.render?.();
  }, [latex, shouldRenderMath]);

  if (!shouldRenderMath) {
    return <span className={cn("align-middle", className)}>{value}</span>;
  }

  return createElement("math-span", {
    ref: (element: HTMLElement | null) => {
      spanRef.current = element as MathSpanElement | null;
    },
    className: cn("inline-block max-w-full align-middle text-inherit", className),
    "aria-hidden": true,
  });
}

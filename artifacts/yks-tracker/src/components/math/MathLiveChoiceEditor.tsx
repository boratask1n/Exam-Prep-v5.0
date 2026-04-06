import { MathfieldElement } from "./mathliveSetup";
import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { convertLegacyMathValueToLatex } from "./mathExpression";

type MathLiveChoiceEditorProps = {
  value: string;
  placeholder?: string;
  active?: boolean;
  onActivate?: () => void;
  onChange: (value: string) => void;
};

type LatexKey = {
  insert: string;
  displayText?: string;
};

type KeyboardCell = string | LatexKey;

type KeyboardSection = {
  id: string;
  label: string;
  rows: KeyboardCell[][];
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  baseLeft: number;
  baseTop: number;
};

function latexKey(insert: string, displayText = insert): LatexKey {
  return { insert, displayText };
}

const COMMON_COLUMNS: KeyboardCell[][] = [
  ["7", "8", "9", latexKey("\\div", "÷")],
  ["4", "5", "6", latexKey("\\times", "×")],
  ["1", "2", "3", "+"],
  ["0", ",", ".", "-"],
];

const KEYBOARD_SECTIONS: KeyboardSection[] = [
  {
    id: "algebra",
    label: "Cebir",
    rows: [
      [
        latexKey("\\frac{#0}{#0}", "x/y"),
        latexKey("\\sqrt{#0}", "\u221Ax"),
        latexKey("x^{#0}", "x\u207F"),
        latexKey("\\log\\left(#0\\right)", "log"),
      ],
      ...COMMON_COLUMNS,
      ["(", ")", latexKey("\\pi", "\u03C0"), latexKey("\\infty", "\u221E")],
    ],
  },
  {
    id: "trigonometry",
    label: "Trigonometri",
    rows: [
      [
        latexKey("\\sin\\left(#0\\right)", "sin"),
        latexKey("\\cos\\left(#0\\right)", "cos"),
        latexKey("\\tan\\left(#0\\right)", "tan"),
        latexKey("\\cot\\left(#0\\right)", "cot"),
      ],
      ...COMMON_COLUMNS,
      [latexKey("\\theta", "\u03B8"), latexKey("\\alpha", "\u03B1"), latexKey("\\beta", "\u03B2"), latexKey("^\\circ", "\u00B0")],
    ],
  },
  {
    id: "calculus",
    label: "Kalk\u00FCl\u00FCs",
    rows: [
      [
        latexKey("\\lim_{x\\to #0}\\left(#0\\right)", "lim x\u2192a"),
        latexKey("\\lim_{x\\to #0{}^{\\color{black}{-}}}\\left(#0\\right)", "lim x\u2192a\u207B"),
        latexKey("\\lim_{x\\to #0{}^{\\color{black}{+}}}\\left(#0\\right)", "lim x\u2192a\u207A"),
        latexKey("\\int_{#0}^{#0} #0\\,dx", "∫ₐᵇ"),
      ],
      [
        latexKey("\\frac{d}{dx}\\left(#0\\right)", "d/dx"),
        latexKey("\\sum_{n=#0}^{#0} #0", "∑"),
        latexKey("\\infty", "\u221E"),
        latexKey("\\Delta x", "\u0394x"),
      ],
      ...COMMON_COLUMNS,
      [latexKey("e", "e"), latexKey("x", "x"), "(", ")"],
    ],
  },
];

function getCellInsertValue(cell: KeyboardCell) {
  return typeof cell === "string" ? cell : cell.insert;
}

function getCellPlainLabel(cell: KeyboardCell) {
  return typeof cell === "string" ? cell : cell.displayText ?? cell.insert;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function MathKeyButton({
  cell,
  onPress,
}: {
  cell: KeyboardCell;
  onPress: (cell: KeyboardCell) => void;
}) {
  return (
    <button
      type="button"
      className="flex h-14 items-center justify-center rounded-[1.1rem] border border-border/60 bg-background/85 px-3 text-base text-foreground shadow-[0_10px_24px_-20px_rgba(15,23,42,0.42),inset_0_1px_0_rgba(255,255,255,0.9)] transition hover:border-primary/30 hover:bg-accent/70 hover:text-accent-foreground"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onPress(cell);
      }}
    >
      <span className="pointer-events-none whitespace-nowrap">{getCellPlainLabel(cell)}</span>
    </button>
  );
}

function FloatingMathKeyboard({
  visible,
  sectionId,
  onSectionChange,
  onInsert,
  onBackspace,
  onClear,
  onClose,
}: {
  visible: boolean;
  sectionId: string;
  onSectionChange: (sectionId: string) => void;
  onInsert: (cell: KeyboardCell) => void;
  onBackspace: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!visible) {
      dragStateRef.current = null;
    }
  }, [visible]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      const panel = panelRef.current;
      if (!drag || drag.pointerId !== event.pointerId || !panel) return;
      event.preventDefault();
      const nextLeft = drag.baseLeft + event.clientX - drag.startX;
      const nextTop = drag.baseTop + event.clientY - drag.startY;
      const maxLeft = Math.max(16, window.innerWidth - panel.offsetWidth - 16);
      const maxTop = Math.max(16, window.innerHeight - panel.offsetHeight - 16);
      setPosition({
        left: clamp(nextLeft, 16, maxLeft),
        top: clamp(nextTop, 16, maxTop),
      });
    };

    const stopDrag = (event?: PointerEvent) => {
      if (event && dragStateRef.current?.pointerId !== event.pointerId) return;
      dragStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const panel = panelRef.current;
    if (!panel || position) return;
    const left = Math.max(16, window.innerWidth - panel.offsetWidth - 24);
    const top = Math.max(16, window.innerHeight - panel.offsetHeight - 24);
    setPosition({ left, top });
  }, [visible, position]);

  useEffect(() => {
    const handleResize = () => {
      const panel = panelRef.current;
      if (!panel || !position) return;
      const maxLeft = Math.max(16, window.innerWidth - panel.offsetWidth - 16);
      const maxTop = Math.max(16, window.innerHeight - panel.offsetHeight - 16);
      setPosition({
        left: clamp(position.left, 16, maxLeft),
        top: clamp(position.top, 16, maxTop),
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [position]);

  const activeSection = KEYBOARD_SECTIONS.find((section) => section.id === sectionId) ?? KEYBOARD_SECTIONS[0];

  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] pointer-events-none"
      aria-hidden="true"
    >
      <div
        ref={panelRef}
        className="pointer-events-auto fixed w-[min(32rem,calc(100vw-1.5rem))] rounded-[1.7rem] border border-card-border/80 bg-[linear-gradient(180deg,color-mix(in_srgb,hsl(var(--card))_95%,white)_0%,hsl(var(--card))_100%)] shadow-[0_28px_56px_-30px_rgba(15,23,42,0.42),0_16px_32px_-22px_rgba(124,58,237,0.24),inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur-xl dark:bg-[linear-gradient(180deg,color-mix(in_srgb,hsl(var(--card))_90%,hsl(var(--background)))_0%,hsl(var(--card))_100%)]"
        style={position ? { left: position.left, top: position.top } : { right: 24, bottom: 24 }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3">
          <button
            type="button"
            className="flex flex-1 cursor-grab items-center justify-center gap-2 rounded-full px-3 py-1.5 text-xs text-muted-foreground active:cursor-grabbing"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const panel = panelRef.current;
              if (!panel) return;
              const rect = panel.getBoundingClientRect();
              dragStateRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                baseLeft: rect.left,
                baseTop: rect.top,
              };
              setPosition({ left: rect.left, top: rect.top });
            }}
          >
            <span className="h-1 w-10 rounded-full bg-muted-foreground/25" />
            <span className="h-1 w-10 rounded-full bg-muted-foreground/25" />
            <span className="h-1 w-10 rounded-full bg-muted-foreground/25" />
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background/80 text-muted-foreground transition hover:border-primary/30 hover:bg-accent hover:text-accent-foreground"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }}
          >
            {"×"}
          </button>
        </div>

        <div className="border-b border-border/40 px-4 pt-3">
          <div className="flex items-center gap-5">
            {KEYBOARD_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={cn(
                  "pb-2 text-[1rem] font-medium text-muted-foreground transition",
                  section.id === activeSection.id && "border-b-2 border-primary text-primary",
                )}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSectionChange(section.id);
                }}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2.5 px-4 py-4">
          {activeSection.rows.map((row, rowIndex) => (
            <div key={`${activeSection.id}-${rowIndex}`} className="grid grid-cols-4 gap-2.5">
              {row.map((cell, cellIndex) => (
                <MathKeyButton key={`${activeSection.id}-${rowIndex}-${cellIndex}`} cell={cell} onPress={onInsert} />
              ))}
            </div>
          ))}

          <div className="mt-1 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              className="flex h-12 items-center justify-center rounded-[1rem] border border-border/60 bg-background/75 text-sm font-medium text-muted-foreground transition hover:border-primary/30 hover:bg-accent/70 hover:text-accent-foreground"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onBackspace();
              }}
            >
              Geri sil
            </button>
            <button
              type="button"
              className="flex h-12 items-center justify-center rounded-[1rem] border border-destructive/20 bg-destructive/8 text-sm font-medium text-destructive transition hover:bg-destructive/14"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClear();
              }}
            >
              Temizle
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function MathLiveChoiceEditor({
  value,
  placeholder,
  active = false,
  onActivate,
  onChange,
}: MathLiveChoiceEditorProps) {
  const fieldRef = useRef<MathfieldElement | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState(KEYBOARD_SECTIONS[0].id);
  const latexValue = useMemo(() => convertLegacyMathValueToLatex(value), [value]);
  const showPlaceholder = !latexValue.trim();

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;

    field.smartFence = true;
    field.smartMode = true;
    field.mathVirtualKeyboardPolicy = "manual";
    field.defaultMode = "math";
    field.popoverPolicy = "off";
    field.environmentPopoverPolicy = "off";
    field.menuItems = [];

    const handleInput = () => onChange(field.getValue("latex-expanded"));
    const handleFocus = () => {
      onActivate?.();
      setKeyboardVisible(true);
      window.mathVirtualKeyboard?.hide({ animate: false });
    };
    const handleBlur = () => {
      window.setTimeout(() => {
        if (document.activeElement !== fieldRef.current) {
          setKeyboardVisible(false);
        }
      }, 0);
    };

    field.addEventListener("input", handleInput);
    field.addEventListener("focusin", handleFocus);
    field.addEventListener("focusout", handleBlur);

    return () => {
      field.removeEventListener("input", handleInput);
      field.removeEventListener("focusin", handleFocus);
      field.removeEventListener("focusout", handleBlur);
    };
  }, [onActivate, onChange]);

  useEffect(() => {
    if (!keyboardVisible) return;
    window.mathVirtualKeyboard?.hide({ animate: false });
  }, [keyboardVisible]);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    if (field.value !== latexValue) {
      field.setValue(latexValue, { silenceNotifications: true, mode: "math" });
    }
  }, [latexValue]);

  const applyCommand = (command: string | [string, string]) => {
    const field = fieldRef.current;
    if (!field) return;
    field.focus();
    const executed =
      typeof command === "string"
        ? field.executeCommand(command as never)
        : field.executeCommand(command as never);
    if (!executed && Array.isArray(command) && command[0] === "insert") {
      field.insert(command[1], { format: "latex" });
    }
    onChange(field.getValue("latex-expanded"));
  };

  const handleInsert = (cell: KeyboardCell) => {
    applyCommand(["insert", getCellInsertValue(cell)]);
  };

  const handleBackspace = () => {
    applyCommand("deleteBackward");
  };

  const handleClear = () => {
    const field = fieldRef.current;
    if (!field) return;
    field.setValue("", { silenceNotifications: true, mode: "math" });
    field.focus();
    onChange("");
  };

  const handleClose = () => {
    setKeyboardVisible(false);
    fieldRef.current?.blur();
    window.mathVirtualKeyboard?.hide({ animate: false });
  };

  return (
    <>
      <div className="relative">
        {showPlaceholder && placeholder ? (
          <span className="pointer-events-none absolute left-5 top-1/2 z-[3] -translate-y-1/2 whitespace-pre text-[1.7rem] tracking-normal text-muted-foreground/55 italic">
            {placeholder}
          </span>
        ) : null}
        {createElement("math-field", {
          ref: (element: MathfieldElement | HTMLElement | null) => {
            fieldRef.current = element as MathfieldElement | null;
          },
          className: cn(
            "relative z-[2] block min-h-[5.15rem] w-full rounded-[1.65rem] border bg-background px-5 py-4 text-[1.75rem] shadow-sm outline-none transition",
            active || keyboardVisible ? "border-primary ring-2 ring-primary/15" : "border-border/50",
          ),
        })}
      </div>
      <FloatingMathKeyboard
        visible={keyboardVisible}
        sectionId={activeSectionId}
        onSectionChange={setActiveSectionId}
        onInsert={handleInsert}
        onBackspace={handleBackspace}
        onClear={handleClear}
        onClose={handleClose}
      />
    </>
  );
}


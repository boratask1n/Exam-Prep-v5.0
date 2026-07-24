import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
} from "react";
import {
  createFractionNode,
  createIntegralNode,
  createLimitNode,
  createTextNode,
  type MathExpressionNode,
  normalizeMathNodes,
  parseMathExpression,
  serializeMathNodes,
} from "./mathExpression";

export type MathChoiceEditorHandle = {
  insertText: (value: string, cursorOffset?: number) => void;
  insertIntegral: () => void;
  insertLimit: () => void;
  insertFraction: () => void;
  backspace: () => void;
  clear: () => void;
};

type MathChoiceEditorProps = {
  value: string;
  placeholder?: string;
  active?: boolean;
  onActivate?: () => void;
  onChange: (value: string) => void;
};

function getSelectionRange(input: HTMLInputElement | null, fallback: string) {
  return {
    start: input?.selectionStart ?? fallback.length,
    end: input?.selectionEnd ?? fallback.length,
  };
}

export const MathChoiceEditor = forwardRef<MathChoiceEditorHandle, MathChoiceEditorProps>(
  function MathChoiceEditor({ value, placeholder, active = false, onActivate, onChange }, ref) {
    const [nodes, setNodes] = useState<MathExpressionNode[]>(() => parseMathExpression(value));
    const containerRef = useRef<HTMLDivElement | null>(null);
    const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const activeTextNodeIdRef = useRef<string | null>(null);

    const serialized = useMemo(() => serializeMathNodes(nodes), [nodes]);
    const hasStructuredNode = useMemo(() => nodes.some((node) => node.type !== "text"), [nodes]);
    const renderedNodes = nodes;

    useEffect(() => {
      if (value !== serialized) {
        setNodes(parseMathExpression(value));
      }
    }, [value, serialized]);

    const commitNodes = (nextNodes: MathExpressionNode[]) => {
      const normalized = normalizeMathNodes(nextNodes);
      setNodes(normalized);
      onChange(serializeMathNodes(normalized));
    };

    const setTextNodeValue = (id: string, text: string) => {
      commitNodes(
        nodes.map((node) => (node.id === id && node.type === "text" ? { ...node, text } : node)),
      );
    };

    const updateNode = (id: string, patch: Partial<MathExpressionNode>) => {
      commitNodes(nodes.map((node) => (node.id === id ? ({ ...node, ...patch } as MathExpressionNode) : node)));
    };

    const ensureTextFocus = (nodeId: string, cursor: number) => {
      window.requestAnimationFrame(() => {
        const input = inputRefs.current[nodeId];
        if (!input) return;
        input.focus();
        input.setSelectionRange(cursor, cursor);
      });
    };

    const getFocusedInnerInput = () => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLInputElement &&
        containerRef.current?.contains(activeElement)
      ) {
        return activeElement;
      }
      return null;
    };

    const updateFocusedInputValue = (
      transform: (value: string, start: number, end: number) => { value: string; cursor: number },
    ) => {
      const focusedInput = getFocusedInnerInput();
      if (!focusedInput) return false;

      const start = focusedInput.selectionStart ?? focusedInput.value.length;
      const end = focusedInput.selectionEnd ?? focusedInput.value.length;
      const result = transform(focusedInput.value, start, end);
      focusedInput.value = result.value;
      focusedInput.dispatchEvent(new Event("input", { bubbles: true }));

      window.requestAnimationFrame(() => {
        focusedInput.focus();
        focusedInput.setSelectionRange(result.cursor, result.cursor);
      });

      return true;
    };

    const insertStructuredNode = (factory: () => MathExpressionNode) => {
      onActivate?.();
      const activeTextId = activeTextNodeIdRef.current;
      const activeIndex = nodes.findIndex((node) => node.id === activeTextId && node.type === "text");

      if (activeIndex >= 0) {
        const activeNode = nodes[activeIndex] as Extract<MathExpressionNode, { type: "text" }>;
        const input = inputRefs.current[activeNode.id];
        const selection = getSelectionRange(input, activeNode.text);
        const before = activeNode.text.slice(0, selection.start);
        const after = activeNode.text.slice(selection.end);
        const trailingTextNode = createTextNode(after);

        const nextNodes = [
          ...nodes.slice(0, activeIndex),
          createTextNode(before),
          factory(),
          trailingTextNode,
          ...nodes.slice(activeIndex + 1),
        ];

        commitNodes(nextNodes);
        activeTextNodeIdRef.current = trailingTextNode.id;
        ensureTextFocus(trailingTextNode.id, 0);
        return;
      }

      const nextNodes = [createTextNode(""), factory(), createTextNode("")];
      commitNodes(nextNodes);
      activeTextNodeIdRef.current = nextNodes[2].id;
      ensureTextFocus(nextNodes[2].id, 0);
    };

    const insertText = (valueToInsert: string, cursorOffset = 0) => {
      onActivate?.();
      if (
        updateFocusedInputValue((value, start, end) => ({
          value: value.slice(0, start) + valueToInsert + value.slice(end),
          cursor: start + valueToInsert.length + cursorOffset,
        }))
      ) {
        return;
      }
      const activeTextId = activeTextNodeIdRef.current;
      const activeNode = nodes.find(
        (node) => node.id === activeTextId && node.type === "text",
      ) as Extract<MathExpressionNode, { type: "text" }> | undefined;

      if (!activeNode) {
        const lastTextNode = [...nodes].reverse().find((node) => node.type === "text") as
          | Extract<MathExpressionNode, { type: "text" }>
          | undefined;
        if (lastTextNode) {
          activeTextNodeIdRef.current = lastTextNode.id;
          window.requestAnimationFrame(() => inputRefs.current[lastTextNode.id]?.focus());
          return insertText(valueToInsert, cursorOffset);
        }

        const nextTextNode = createTextNode(valueToInsert);
        commitNodes([...nodes, nextTextNode]);
        activeTextNodeIdRef.current = nextTextNode.id;
        ensureTextFocus(nextTextNode.id, nextTextNode.text.length + cursorOffset);
        return;
      }

      const input = inputRefs.current[activeNode.id];
      const selection = getSelectionRange(input, activeNode.text);
      const nextText =
        activeNode.text.slice(0, selection.start) +
        valueToInsert +
        activeNode.text.slice(selection.end);

      commitNodes(
        nodes.map((node) => (node.id === activeNode.id && node.type === "text" ? { ...node, text: nextText } : node)),
      );
      ensureTextFocus(activeNode.id, selection.start + valueToInsert.length + cursorOffset);
    };

    const backspace = () => {
      onActivate?.();
      if (
        updateFocusedInputValue((value, start, end) => {
          if (start === 0 && end === 0) return { value, cursor: 0 };
          const deleteStart = start === end ? start - 1 : start;
          return {
            value: value.slice(0, Math.max(0, deleteStart)) + value.slice(end),
            cursor: Math.max(0, deleteStart),
          };
        })
      ) {
        return;
      }
      const activeTextId = activeTextNodeIdRef.current;
      const activeNode = nodes.find(
        (node) => node.id === activeTextId && node.type === "text",
      ) as Extract<MathExpressionNode, { type: "text" }> | undefined;

      if (activeNode) {
        const input = inputRefs.current[activeNode.id];
        const selection = getSelectionRange(input, activeNode.text);
        if (selection.start === 0 && selection.end === 0) {
          return;
        }

        const deleteStart = selection.start === selection.end ? selection.start - 1 : selection.start;
        const nextText =
          activeNode.text.slice(0, Math.max(0, deleteStart)) +
          activeNode.text.slice(selection.end);

        commitNodes(
          nodes.map((node) =>
            node.id === activeNode.id && node.type === "text" ? { ...node, text: nextText } : node,
          ),
        );
        ensureTextFocus(activeNode.id, Math.max(0, deleteStart));
        return;
      }

      if (nodes.length <= 1) return;
      const nextNodes = nodes.slice(0, -1);
      const normalized = normalizeMathNodes(nextNodes);
      const trailingTextNode = [...normalized].reverse().find((node) => node.type === "text") as
        | Extract<MathExpressionNode, { type: "text" }>
        | undefined;

      setNodes(normalized);
      onChange(serializeMathNodes(normalized));

      if (trailingTextNode) {
        activeTextNodeIdRef.current = trailingTextNode.id;
        ensureTextFocus(trailingTextNode.id, trailingTextNode.text.length);
      }
    };

    const clear = () => {
      onActivate?.();
      const nextTextNode = createTextNode("");
      setNodes([nextTextNode]);
      onChange("");
      activeTextNodeIdRef.current = nextTextNode.id;
      ensureTextFocus(nextTextNode.id, 0);
    };

    useImperativeHandle(ref, () => ({
      insertText,
      insertIntegral: () => insertStructuredNode(() => createIntegralNode()),
      insertLimit: () => insertStructuredNode(() => createLimitNode()),
      insertFraction: () => insertStructuredNode(() => createFractionNode()),
      backspace,
      clear,
    }));

    const handleFocus = (_event: FocusEvent<HTMLElement>, textNodeId?: string) => {
      onActivate?.();
      if (textNodeId) {
        activeTextNodeIdRef.current = textNodeId;
      }
    };

    return (
      <div
        ref={containerRef}
        className={`rounded-[1.5rem] border bg-background px-5 py-4 shadow-sm transition ${
          active ? "border-primary/60 ring-2 ring-primary/15" : "border-border/50"
        }`}
        onClick={() => onActivate?.()}
      >
        <div className="flex min-h-[4rem] flex-wrap items-center gap-x-1 gap-y-2 text-[16px] leading-8">
          {renderedNodes.map((node) => {
            if (node.type === "text") {
              const shouldStretch = nodes.length === 1;
              const calculatedWidth = `${Math.max(node.text.length + 1, 2)}ch`;

              return (
                <input
                  key={node.id}
                  ref={(element) => {
                    inputRefs.current[node.id] = element;
                  }}
                  value={node.text}
                  onFocus={(event) => handleFocus(event, node.id)}
                  onChange={(event) => setTextNodeValue(node.id, event.target.value)}
                  placeholder={placeholder}
                  style={shouldStretch ? undefined : { width: calculatedWidth }}
                  className={`bg-transparent text-[16px] leading-8 text-foreground outline-none placeholder:text-muted-foreground/70 ${
                    shouldStretch ? "min-w-[3rem] flex-1" : "min-w-[1.2rem] flex-none"
                  }`}
                />
              );
            }

            if (node.type === "integral") {
              return (
                <div
                  key={node.id}
                  onFocus={(event) => handleFocus(event)}
                  className="inline-flex max-w-full items-center gap-2 px-0.5 py-0.5 align-middle"
                >
                  <div className="relative flex min-w-[2rem] items-center justify-center">
                    <input
                      value={node.upper}
                      onChange={(event) => updateNode(node.id, { upper: event.target.value })}
                      className="absolute -top-2.5 w-12 bg-transparent text-center text-[11px] text-foreground outline-none"
                    />
                    <span className="text-[1.55rem] leading-none text-foreground">{"\u222B"}</span>
                    <input
                      value={node.lower}
                      onChange={(event) => updateNode(node.id, { lower: event.target.value })}
                      className="absolute -bottom-2.5 w-12 bg-transparent text-center text-[11px] text-foreground outline-none"
                    />
                  </div>
                  <input
                    value={node.body}
                    onChange={(event) => updateNode(node.id, { body: event.target.value })}
                    className="min-w-[10rem] flex-1 bg-transparent px-0.5 text-[16px] leading-8 text-foreground outline-none"
                  />
                </div>
              );
            }

            if (node.type === "limit") {
              return (
                <div
                  key={node.id}
                  onFocus={(event) => handleFocus(event)}
                  className="inline-flex items-center gap-2 px-0.5 py-0.5 align-middle"
                >
                  <div className="inline-flex min-w-[4rem] flex-col items-center justify-center leading-none">
                    <span className="text-[1.05rem] font-medium leading-none text-foreground">lim</span>
                    <div className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] text-foreground">
                      <input
                        value={node.variable}
                        onChange={(event) => updateNode(node.id, { variable: event.target.value })}
                        className="w-6 bg-transparent text-center outline-none"
                      />
                      <span>{"\u2192"}</span>
                      <input
                        value={node.target}
                        onChange={(event) => updateNode(node.id, { target: event.target.value })}
                        className="w-8 bg-transparent text-center outline-none"
                      />
                    </div>
                  </div>
                  <input
                    value={node.body}
                    onChange={(event) => updateNode(node.id, { body: event.target.value })}
                    className="min-w-[8rem] flex-1 bg-transparent px-0.5 text-[16px] leading-8 text-foreground outline-none"
                  />
                </div>
              );
            }

            return (
              <div
                key={node.id}
                onFocus={(event) => handleFocus(event)}
                className="inline-flex items-center gap-1 px-0.5 py-0.5 align-middle"
              >
                <div className="inline-flex flex-col items-center">
                  <input
                    value={node.numerator}
                    onChange={(event) => updateNode(node.id, { numerator: event.target.value })}
                    className="w-14 border-b border-foreground/50 bg-transparent text-center text-[11px] text-foreground outline-none"
                  />
                  <input
                    value={node.denominator}
                    onChange={(event) => updateNode(node.id, { denominator: event.target.value })}
                    className="w-14 bg-transparent text-center text-[11px] text-foreground outline-none"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);

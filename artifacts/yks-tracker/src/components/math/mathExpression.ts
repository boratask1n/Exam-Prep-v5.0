export type MathExpressionNode =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "integral"; lower: string; upper: string; body: string }
  | { id: string; type: "limit"; variable: string; target: string; body: string }
  | { id: string; type: "fraction"; numerator: string; denominator: string };

const TOKEN_REGEX = /\[\[(INT|LIM|FRAC):([\s\S]*?)\]\]/g;

let nodeCounter = 0;

export function createMathNodeId(prefix = "node") {
  nodeCounter += 1;
  return `${prefix}-${nodeCounter}`;
}

export function createTextNode(text = ""): Extract<MathExpressionNode, { type: "text" }> {
  return { id: createMathNodeId("text"), type: "text", text };
}

export function createIntegralNode(
  lower = "0",
  upper = "1",
  body = "f(x)dx",
): Extract<MathExpressionNode, { type: "integral" }> {
  return { id: createMathNodeId("int"), type: "integral", lower, upper, body };
}

export function createLimitNode(
  variable = "x",
  target = "0",
  body = "f(x)",
): Extract<MathExpressionNode, { type: "limit" }> {
  return { id: createMathNodeId("lim"), type: "limit", variable, target, body };
}

export function createFractionNode(
  numerator = "a+b",
  denominator = "c",
): Extract<MathExpressionNode, { type: "fraction" }> {
  return { id: createMathNodeId("frac"), type: "fraction", numerator, denominator };
}

export function serializeMathNodes(nodes: MathExpressionNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return node.text;
        case "integral":
          return `[[INT:${node.lower}|${node.upper}|${node.body}]]`;
        case "limit":
          return `[[LIM:${node.variable}|${node.target}|${node.body}]]`;
        case "fraction":
          return `[[FRAC:${node.numerator}|${node.denominator}]]`;
      }
    })
    .join("");
}

export function normalizeMathNodes(nodes: MathExpressionNode[]): MathExpressionNode[] {
  const merged: MathExpressionNode[] = [];

  for (const node of nodes) {
    if (node.type === "text") {
      const last = merged[merged.length - 1];
      if (last?.type === "text") {
        last.text += node.text;
      } else {
        merged.push({ ...node });
      }
      continue;
    }

    merged.push({ ...node });
  }

  if (merged.length === 0) {
    return [createTextNode("")];
  }

  if (merged[merged.length - 1]?.type !== "text") {
    merged.push(createTextNode(""));
  }

  return merged;
}

export function parseMathExpression(text: string): MathExpressionNode[] {
  const nodes: MathExpressionNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TOKEN_REGEX)) {
    const fullMatch = match[0];
    const tokenType = match[1];
    const payload = match[2] ?? "";
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      nodes.push(createTextNode(text.slice(lastIndex, matchIndex)));
    }

    if (tokenType === "INT") {
      const [lower = "0", upper = "1", body = "f(x)dx"] = payload.split("|");
      nodes.push(createIntegralNode(lower, upper, body));
    } else if (tokenType === "LIM") {
      const [variable = "x", target = "0", body = "f(x)"] = payload.split("|");
      nodes.push(createLimitNode(variable, target, body));
    } else if (tokenType === "FRAC") {
      const [numerator = "a+b", denominator = "c"] = payload.split("|");
      nodes.push(createFractionNode(numerator, denominator));
    } else {
      nodes.push(createTextNode(fullMatch));
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < text.length) {
    nodes.push(createTextNode(text.slice(lastIndex)));
  }

  return normalizeMathNodes(nodes);
}

export function convertLegacyMathValueToLatex(value: string) {
  const normalizeOneSidedLimitSigns = (latex: string) =>
    latex.replace(/\^\{([+-])\}/g, (_, sign: string) => `^{\\color{black}{${sign}}}`);

  if (!value.includes("[[")) return normalizeOneSidedLimitSigns(value);

  return normalizeOneSidedLimitSigns(
    parseMathExpression(value)
    .map((node) => {
      switch (node.type) {
        case "text":
          return node.text;
        case "integral":
          return `\\int_{${node.lower}}^{${node.upper}} ${node.body}`;
        case "limit":
          return `\\lim_{${node.variable}\\to${node.target}} ${node.body}`;
        case "fraction":
          return `\\frac{${node.numerator}}{${node.denominator}}`;
      }
    })
    .join(""),
  );
}

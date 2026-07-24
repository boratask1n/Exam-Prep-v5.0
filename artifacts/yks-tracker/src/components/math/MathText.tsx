import { Fragment } from "react";
import { parseMathExpression } from "./mathExpression";

type MathTextProps = {
  text: string;
  className?: string;
};

export function MathText({ text, className }: MathTextProps) {
  const tokens = parseMathExpression(text);

  return (
    <span className={className}>
      {tokens.map((token, index) => {
        if (token.type === "text") {
          return <Fragment key={`text-${index}`}>{token.text}</Fragment>;
        }

        if (token.type === "integral") {
          return (
            <span key={`int-${index}`} className="mx-0.5 inline-flex min-w-[5.5rem] items-center align-middle">
              <span className="relative inline-flex min-w-[1.5rem] items-center justify-center">
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[0.58em] leading-none text-foreground/90">
                  {token.upper || "b"}
                </span>
                <span className="text-[1.45em] leading-none text-foreground">{"\u222B"}</span>
                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[0.58em] leading-none text-foreground/90">
                  {token.lower || "a"}
                </span>
              </span>
              <span className="ml-1 inline-block min-w-[3.8rem]">{token.body || "f(x)dx"}</span>
            </span>
          );
        }

        if (token.type === "limit") {
          return (
            <span key={`lim-${index}`} className="mx-0.5 inline-flex min-w-[3.5rem] items-center justify-center gap-1 align-middle">
              <span className="inline-flex flex-col items-center leading-none text-center">
                <span className="text-[0.96em] font-medium leading-none text-foreground">lim</span>
                <span className="mt-[1px] text-[0.58em] leading-none text-foreground/90">
                  {token.variable || "x"}{"\u2192"}{token.target || "0"}
                </span>
              </span>
              <span className="inline-block min-w-[2.8rem]">{token.body || "f(x)"}</span>
            </span>
          );
        }

        if (token.type === "fraction") {
          return (
            <span key={`frac-${index}`} className="mx-0.5 inline-flex min-w-[2.6rem] flex-col items-center align-middle text-foreground">
              <span className="border-b border-foreground/70 px-1 text-[0.92em] leading-tight">
                {token.numerator || "a+b"}
              </span>
              <span className="px-1 text-[0.92em] leading-tight">{token.denominator || "c"}</span>
            </span>
          );
        }

        return null;
      })}
    </span>
  );
}

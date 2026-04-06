import type { MathfieldElement } from "mathlive";
import type * as React from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "math-field": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        ref?: React.Ref<MathfieldElement | HTMLElement>;
        placeholder?: string;
        class?: string;
        className?: string;
      };
      "math-span": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        class?: string;
        className?: string;
      };
    }
  }
}

export {};

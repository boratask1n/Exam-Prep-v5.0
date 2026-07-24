import "mathlive";
import { MathfieldElement, convertLatexToMarkup } from "mathlive";

const baseUrl = import.meta.env.BASE_URL ?? "/";
const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
const fontsDirectory =
  typeof window !== "undefined"
    ? new URL(`${normalizedBaseUrl}mathlive-fonts/`, window.location.origin).toString()
    : `${normalizedBaseUrl}mathlive-fonts/`;

MathfieldElement.fontsDirectory = fontsDirectory;
MathfieldElement.soundsDirectory = null;

export { MathfieldElement, convertLatexToMarkup, fontsDirectory };

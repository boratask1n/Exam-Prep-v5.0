export const testDraftKey = (testId: number): string => `test-draft-${testId}`;

export const testReviewKey = (testId: number): string => `test-review-${testId}`;

export const clearTestLocalStorage = (testId: number): void => {
  try {
    localStorage.removeItem(testDraftKey(testId));
    localStorage.removeItem(testReviewKey(testId));
  } catch {
    /* Ignore errors */
  }
};

export const hasTestDraft = (testId: number): boolean => {
  try {
    return localStorage.getItem(testDraftKey(testId)) !== null;
  } catch {
    return false;
  }
};

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface InlineStroke {
  tool: "pen" | "eraser";
  color: string;
  width: number;
  points: CanvasPoint[];
}

export interface TestReviewSnapshotV1 {
  version: 1;
  answers: Record<number, string>;
  manualStatuses: Record<number, string>;
  currentIndex?: number;
  timer?: number;
  tempDrawings?: Record<number, string>;
  inlineDrawingsByQuestion?: Record<number, InlineStroke[]>;
  elapsed?: number;
  collapsedLessons?: Record<string, boolean>;
  inlineDrawEnabled: boolean;
}

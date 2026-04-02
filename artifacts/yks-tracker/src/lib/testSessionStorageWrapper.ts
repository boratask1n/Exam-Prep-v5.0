import { buildTestSolutionsInput, useTestSessionStorage } from "./testSessionDbStorage";
import type { TestDraftV1, TestReviewSnapshotV1, CanvasPoint, InlineStroke } from "./testSessionDbStorage";

// ─── Legacy Compatibility Layer ─────────────────────────────────────────────────
// This file provides the same interface as the original localStorage-based storage
// but uses the database backend instead.

export const testDraftKey = (testId: number): string => `test-draft-${testId}`;
export const testReviewKey = (testId: number): string => `test-review-${testId}`;

// Clear localStorage for migration purposes
export const clearTestLocalStorage = (testId: number): void => {
  try {
    localStorage.removeItem(testDraftKey(testId));
    localStorage.removeItem(testReviewKey(testId));
  } catch {
    /* Ignore errors */
  }
};

// Check if localStorage has data (for migration)
export const hasTestDraft = (testId: number): boolean => {
  try {
    return localStorage.getItem(testDraftKey(testId)) !== null;
  } catch {
    return false;
  }
};

function normalizeInlineStrokes(value: unknown): InlineStroke[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((stroke: any) => ({
      tool: (stroke?.tool === "eraser" ? "eraser" : "pen") as "pen" | "eraser",
      color: typeof stroke?.color === "string" ? stroke.color : "#111111",
      width: typeof stroke?.width === "number" ? stroke.width : 1,
      points: Array.isArray(stroke?.points)
        ? stroke.points
            .filter(
              (point: any) =>
                typeof point?.x === "number" && typeof point?.y === "number",
            )
            .map((point: any) => ({ x: point.x, y: point.y }))
        : [],
    }))
    .filter((stroke) => stroke.points.length > 0);
}

// ─── Storage Service Wrapper ───────────────────────────────────────────────────
export class TestSessionStorageWrapper {
  private testId: number;
  private dbStorage: ReturnType<typeof useTestSessionStorage>["storage"];

  constructor(testId: number, dbStorage: ReturnType<typeof useTestSessionStorage>["storage"]) {
    this.testId = testId;
    this.dbStorage = dbStorage;
  }

  // ─── Load Methods ─────────────────────────────────────────────────────────────
  async loadDraft(): Promise<TestDraftV1 | null> {
    try {
      // First, try to migrate from localStorage if data exists
      if (hasTestDraft(this.testId)) {
        await this.dbStorage.migrateFromLocalStorage();
      }

      // Load from database
      const [solutions, progress] = await Promise.all([
        this.dbStorage.loadSolutions(),
        this.dbStorage.loadProgress(),
      ]);

      if (!solutions.length && !progress) {
        return null;
      }

      // Convert database data to draft format
      const answers: Record<number, string> = {};
      const tempDrawings: Record<number, string> = {};
      const inlineDrawingsByQuestion: Record<number, InlineStroke[]> = {};

      solutions.forEach((solution) => {
        if (solution.userAnswer) {
          answers[solution.questionId] = solution.userAnswer;
        }
        if (solution.tempDrawing) {
          tempDrawings[solution.questionId] = solution.tempDrawing;
        }
        if (solution.inlineDrawings) {
          inlineDrawingsByQuestion[solution.questionId] = normalizeInlineStrokes(
            solution.inlineDrawings,
          );
        }
      });

      return {
        version: 1,
        answers,
        currentIndex: progress?.currentIndex || 0,
        tempDrawings,
        inlineDrawingsByQuestion,
        elapsed: progress?.elapsed || 0,
        collapsedLessons: progress?.collapsedLessons || {},
        inlineDrawEnabled: progress?.inlineDrawEnabled || false,
      };
    } catch (error) {
      console.error("Failed to load draft:", error);
      return null;
    }
  }

  async loadReview(): Promise<TestReviewSnapshotV1 | null> {
    try {
      // First, try to migrate from localStorage if data exists
      if (localStorage.getItem(testReviewKey(this.testId))) {
        await this.dbStorage.migrateFromLocalStorage();
      }

      // Load from database
      const [solutions, progress] = await Promise.all([
        this.dbStorage.loadSolutions(),
        this.dbStorage.loadProgress(),
      ]);

      if (!solutions.length && !progress) {
        return null;
      }

      // Convert database data to review format
      const answers: Record<number, string> = {};
      const manualStatuses: Record<number, string> = {};
      const tempDrawings: Record<number, string> = {};
      const inlineDrawingsByQuestion: Record<number, InlineStroke[]> = {};

      solutions.forEach((solution) => {
        if (solution.userAnswer) {
          answers[solution.questionId] = solution.userAnswer;
        }
        manualStatuses[solution.questionId] = solution.status;
        if (solution.tempDrawing) {
          tempDrawings[solution.questionId] = solution.tempDrawing;
        }
        if (solution.inlineDrawings) {
          inlineDrawingsByQuestion[solution.questionId] = normalizeInlineStrokes(
            solution.inlineDrawings,
          );
        }
      });

      return {
        version: 1,
        answers,
        manualStatuses,
        currentIndex: progress?.currentIndex,
        timer: progress?.timer ?? undefined,
        tempDrawings,
        inlineDrawingsByQuestion,
        elapsed: progress?.elapsed,
        collapsedLessons: progress?.collapsedLessons ?? undefined,
        inlineDrawEnabled: progress?.inlineDrawEnabled || false,
      };
    } catch (error) {
      console.error("Failed to load review:", error);
      return null;
    }
  }

  // ─── Save Methods ─────────────────────────────────────────────────────────────
  async saveDraft(draft: TestDraftV1): Promise<void> {
    try {
      const solutions = buildTestSolutionsInput({
        answers: draft.answers,
        tempDrawings: draft.tempDrawings || {},
        inlineDrawingsByQuestion: draft.inlineDrawingsByQuestion || {},
        inlineDrawEnabled: draft.inlineDrawEnabled,
        isCompleted: false,
      });

      const progress = {
        currentIndex: draft.currentIndex,
        elapsed: draft.elapsed,
        isCompleted: false,
        inlineDrawEnabled: draft.inlineDrawEnabled,
        collapsedLessons: draft.collapsedLessons || {},
      };

      // Save to database
      await Promise.all([
        this.dbStorage.saveSolutions(solutions),
        this.dbStorage.saveProgress(progress),
      ]);

      // Clear localStorage after successful migration
      clearTestLocalStorage(this.testId);
    } catch (error) {
      console.error("Failed to save draft:", error);
      throw error;
    }
  }

  async saveReview(review: TestReviewSnapshotV1): Promise<void> {
    try {
      const solutions = buildTestSolutionsInput({
        answers: review.answers,
        tempDrawings: review.tempDrawings || {},
        inlineDrawingsByQuestion: review.inlineDrawingsByQuestion || {},
        inlineDrawEnabled: review.inlineDrawEnabled,
        isCompleted: true,
        manualStatuses: review.manualStatuses,
      });

      const progress = {
        currentIndex: review.currentIndex || 0,
        timer: review.timer,
        elapsed: review.elapsed || 0,
        isCompleted: true,
        inlineDrawEnabled: review.inlineDrawEnabled,
        collapsedLessons: review.collapsedLessons || {},
      };

      // Save to database
      await Promise.all([
        this.dbStorage.saveSolutions(solutions),
        this.dbStorage.saveProgress(progress),
      ]);

      // Clear localStorage after successful migration
      clearTestLocalStorage(this.testId);
    } catch (error) {
      console.error("Failed to save review:", error);
      throw error;
    }
  }

  // ─── Single Question Updates ─────────────────────────────────────────────────
  async saveQuestionSolution(
    questionId: number,
    answer?: string,
    status?: string,
    canvasData?: string,
    inlineDrawings?: InlineStroke[],
    tempDrawing?: string,
    inlineDrawEnabled?: boolean
  ): Promise<void> {
    try {
      await this.dbStorage.saveSingleSolution(questionId, {
        userAnswer: answer || null,
        status: status as any || "Cozulmedi",
        isCompleted: false,
        canvasData: canvasData || null,
        inlineDrawings: inlineDrawings || null,
        tempDrawing: tempDrawing || null,
        inlineDrawEnabled: inlineDrawEnabled || false,
      });
    } catch (error) {
      console.error("Failed to save question solution:", error);
      throw error;
    }
  }

  async updateProgress(
    currentIndex?: number,
    timer?: number,
    elapsed?: number,
    isCompleted?: boolean,
    inlineDrawEnabled?: boolean,
    collapsedLessons?: Record<string, boolean>
  ): Promise<void> {
    try {
      await this.dbStorage.saveProgress({
        currentIndex: currentIndex || 0,
        timer: timer || undefined,
        elapsed: elapsed || 0,
        isCompleted: isCompleted || false,
        inlineDrawEnabled: inlineDrawEnabled || false,
        collapsedLessons: collapsedLessons || {},
      });
    } catch (error) {
      console.error("Failed to update progress:", error);
      throw error;
    }
  }

  // ─── Clear Methods ───────────────────────────────────────────────────────────
  async clear(): Promise<void> {
    try {
      // Clear localStorage
      clearTestLocalStorage(this.testId);
      
      // Note: We don't actually delete from database here as it might be needed for history
      // In a real implementation, you might want to add a delete endpoint
    } catch (error) {
      console.error("Failed to clear storage:", error);
    }
  }
}

// ─── React Hook ───────────────────────────────────────────────────────────────
export function useTestSessionStorageWrapper(testId: number) {
  const dbStorage = useTestSessionStorage(testId);
  
  return {
    storage: new TestSessionStorageWrapper(testId, dbStorage.storage),
    // Direct access to underlying methods for convenience
    loadDraft: () => new TestSessionStorageWrapper(testId, dbStorage.storage).loadDraft(),
    saveDraft: (draft: TestDraftV1) => 
      new TestSessionStorageWrapper(testId, dbStorage.storage).saveDraft(draft),
    loadReview: () => new TestSessionStorageWrapper(testId, dbStorage.storage).loadReview(),
    saveReview: (review: TestReviewSnapshotV1) => 
      new TestSessionStorageWrapper(testId, dbStorage.storage).saveReview(review),
    saveQuestionSolution: (
      questionId: number,
      answer?: string,
      status?: string,
      canvasData?: string,
      inlineDrawings?: InlineStroke[],
      tempDrawing?: string,
      inlineDrawEnabled?: boolean
    ) => new TestSessionStorageWrapper(testId, dbStorage.storage).saveQuestionSolution(
      questionId, answer, status, canvasData, inlineDrawings, tempDrawing, inlineDrawEnabled
    ),
    updateProgress: (
      currentIndex?: number,
      timer?: number,
      elapsed?: number,
      isCompleted?: boolean,
      inlineDrawEnabled?: boolean,
      collapsedLessons?: Record<string, boolean>
    ) => new TestSessionStorageWrapper(testId, dbStorage.storage).updateProgress(
      currentIndex, timer, elapsed, isCompleted, inlineDrawEnabled, collapsedLessons
    ),
    clear: () => new TestSessionStorageWrapper(testId, dbStorage.storage).clear(),
    migrateFromLocalStorage: dbStorage.migrateFromLocalStorage,
  };
}

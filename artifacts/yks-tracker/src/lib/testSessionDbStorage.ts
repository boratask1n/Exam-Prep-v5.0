import { 
  useGetTestSolutions,
  useSaveTestSolutions,
  useGetTestProgress,
  useSaveTestProgress,
  useGetTestQuestionSolution,
  useSaveTestQuestionSolution,
  type TestSolution,
  type TestSessionProgress,
  type SaveTestSolutionsInput,
  type SaveTestProgressInput,
  type SaveTestSolutionInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// ─── Types ────────────────────────────────────────────────────────────────────
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

export interface TestDraftV1 {
  version: 1;
  answers: Record<number, string>;
  currentIndex: number;
  tempDrawings: Record<number, string>;
  inlineDrawingsByQuestion: Record<number, InlineStroke[]>;
  elapsed: number;
  collapsedLessons: Record<string, boolean>;
  inlineDrawEnabled: boolean;
}

function getTrackedQuestionIds(
  answers: Record<number, string>,
  tempDrawings: Record<number, string>,
  inlineDrawingsByQuestion: Record<number, InlineStroke[]>,
) {
  const ids = new Set<number>();

  for (const key of Object.keys(answers)) ids.add(Number(key));
  for (const key of Object.keys(tempDrawings)) ids.add(Number(key));
  for (const key of Object.keys(inlineDrawingsByQuestion)) ids.add(Number(key));

  return Array.from(ids).filter((id) => Number.isFinite(id));
}

export function buildTestSolutionsInput(params: {
  answers: Record<number, string>;
  tempDrawings: Record<number, string>;
  inlineDrawingsByQuestion: Record<number, InlineStroke[]>;
  inlineDrawEnabled: boolean;
  isCompleted: boolean;
  manualStatuses?: Record<number, string>;
}): SaveTestSolutionsInput {
  const {
    answers,
    tempDrawings,
    inlineDrawingsByQuestion,
    inlineDrawEnabled,
    isCompleted,
    manualStatuses,
  } = params;

  return {
    solutions: getTrackedQuestionIds(
      answers,
      tempDrawings,
      inlineDrawingsByQuestion,
    ).map((questionId) => ({
      questionId,
      userAnswer: answers[questionId] ?? null,
      status: (manualStatuses?.[questionId] as any) || "Cozulmedi",
      isCompleted,
      inlineDrawings:
        inlineDrawingsByQuestion[questionId] &&
        inlineDrawingsByQuestion[questionId].length > 0
          ? inlineDrawingsByQuestion[questionId]
          : null,
      tempDrawing: tempDrawings[questionId] ?? null,
      inlineDrawEnabled,
    })),
  };
}

// ─── Database Storage Service ───────────────────────────────────────────────────
export class TestSessionDbStorage {
  private testId: number;
  private queryClient: ReturnType<typeof useQueryClient>;

  constructor(testId: number, queryClient: ReturnType<typeof useQueryClient>) {
    this.testId = testId;
    this.queryClient = queryClient;
  }

  // ─── Test Solutions ─────────────────────────────────────────────────────────
  async loadSolutions(): Promise<TestSolution[]> {
    try {
      const solutions = await this.queryClient.fetchQuery({
        queryKey: [`/api/tests/${this.testId}/solutions`],
        queryFn: () => this.fetchSolutions(),
      });
      return solutions || [];
    } catch (error) {
      console.error("Failed to load test solutions:", error);
      return [];
    }
  }

  async saveSolutions(solutions: SaveTestSolutionsInput): Promise<TestSolution[]> {
    try {
      const response = await fetch(`/api/tests/${this.testId}/solutions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(solutions),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save solutions');
      }
      
      const result = await response.json();
      
      // Invalidate cache to refresh data
      this.queryClient.invalidateQueries({
        queryKey: [`/api/tests/${this.testId}/solutions`],
      });
      
      return result || [];
    } catch (error) {
      console.error("Failed to save test solutions:", error);
      throw error;
    }
  }

  async saveSingleSolution(
    questionId: number, 
    solution: SaveTestSolutionInput
  ): Promise<TestSolution> {
    try {
      const result = await this.saveSingleSolutionMutation(questionId, solution);
      
      // Invalidate cache to refresh data
      this.queryClient.invalidateQueries({
        queryKey: [`/api/tests/${this.testId}/solutions`],
      });
      
      return result;
    } catch (error) {
      console.error("Failed to save single test solution:", error);
      throw error;
    }
  }

  // ─── Test Progress ─────────────────────────────────────────────────────────
  async loadProgress(): Promise<TestSessionProgress | null> {
    try {
      const progress = await this.queryClient.fetchQuery({
        queryKey: [`/api/tests/${this.testId}/progress`],
        queryFn: () => this.fetchProgress(),
      });
      return progress || null;
    } catch (error) {
      console.error("Failed to load test progress:", error);
      return null;
    }
  }

  async saveProgress(progress: SaveTestProgressInput): Promise<TestSessionProgress> {
    try {
      const response = await fetch(`/api/tests/${this.testId}/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(progress),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save progress');
      }
      
      const result = await response.json();
      
      // Invalidate cache to refresh data
      this.queryClient.invalidateQueries({
        queryKey: [`/api/tests/${this.testId}/progress`],
      });
      
      return result || null;
    } catch (error) {
      console.error("Failed to save test progress:", error);
      throw error;
    }
  }

  // ─── Migration Helpers ───────────────────────────────────────────────────────
  async migrateFromLocalStorage(): Promise<void> {
    const draftKey = `test-draft-${this.testId}`;
    const reviewKey = `test-review-${this.testId}`;

    try {
      // Try to migrate draft data
      const draftData = localStorage.getItem(draftKey);
      if (draftData) {
        const draft = JSON.parse(draftData) as TestDraftV1;
        await this.migrateDraftData(draft);
        localStorage.removeItem(draftKey);
      }

      // Try to migrate review data
      const reviewData = localStorage.getItem(reviewKey);
      if (reviewData) {
        const review = JSON.parse(reviewData) as TestReviewSnapshotV1;
        await this.migrateReviewData(review);
        localStorage.removeItem(reviewKey);
      }
    } catch (error) {
      console.error("Failed to migrate from localStorage:", error);
    }
  }

  // ─── Private Methods ─────────────────────────────────────────────────────────
  private async fetchSolutions(): Promise<TestSolution[]> {
    const response = await fetch(`/api/tests/${this.testId}/solutions`);
    if (!response.ok) {
      throw new Error("Failed to fetch solutions");
    }
    return response.json();
  }

  private async saveSolutionsMutation(solutions: SaveTestSolutionsInput): Promise<TestSolution[]> {
    const response = await fetch(`/api/tests/${this.testId}/solutions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(solutions),
    });
    if (!response.ok) {
      throw new Error("Failed to save solutions");
    }
    return response.json();
  }

  private async saveSingleSolutionMutation(
    questionId: number,
    solution: SaveTestSolutionInput
  ): Promise<TestSolution> {
    const response = await fetch(`/api/tests/${this.testId}/questions/${questionId}/solution`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(solution),
    });
    if (!response.ok) {
      throw new Error("Failed to save solution");
    }
    return response.json();
  }

  private async fetchProgress(): Promise<TestSessionProgress> {
    const response = await fetch(`/api/tests/${this.testId}/progress`);
    if (!response.ok) {
      throw new Error("Failed to fetch progress");
    }
    return response.json();
  }

  private async saveProgressMutation(progress: SaveTestProgressInput): Promise<TestSessionProgress> {
    const response = await fetch(`/api/tests/${this.testId}/progress`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(progress),
    });
    if (!response.ok) {
      throw new Error("Failed to save progress");
    }
    return response.json();
  }

  private async migrateDraftData(draft: TestDraftV1): Promise<void> {
    const solutions = buildTestSolutionsInput({
      answers: draft.answers,
      tempDrawings: draft.tempDrawings || {},
      inlineDrawingsByQuestion: draft.inlineDrawingsByQuestion || {},
      inlineDrawEnabled: draft.inlineDrawEnabled,
      isCompleted: false,
    });

    await this.saveSolutions(solutions);

    const progress: SaveTestProgressInput = {
      currentIndex: draft.currentIndex,
      elapsed: draft.elapsed,
      isCompleted: false,
      inlineDrawEnabled: draft.inlineDrawEnabled,
      collapsedLessons: draft.collapsedLessons || {},
    };

    await this.saveProgress(progress);
  }

  private async migrateReviewData(review: TestReviewSnapshotV1): Promise<void> {
    const solutions = buildTestSolutionsInput({
      answers: review.answers,
      tempDrawings: review.tempDrawings || {},
      inlineDrawingsByQuestion: review.inlineDrawingsByQuestion || {},
      inlineDrawEnabled: review.inlineDrawEnabled,
      isCompleted: true,
      manualStatuses: review.manualStatuses,
    });

    await this.saveSolutions(solutions);

    const progress: SaveTestProgressInput = {
      currentIndex: review.currentIndex || 0,
      elapsed: review.elapsed || 0,
      isCompleted: true,
      inlineDrawEnabled: review.inlineDrawEnabled,
      collapsedLessons: review.collapsedLessons || {},
    };

    await this.saveProgress(progress);
  }
}

// ─── React Hook ───────────────────────────────────────────────────────────────
export function useTestSessionStorage(testId: number) {
  const queryClient = useQueryClient();
  
  return {
    storage: new TestSessionDbStorage(testId, queryClient),
    // Legacy compatibility functions
    loadSolutions: () => new TestSessionDbStorage(testId, queryClient).loadSolutions(),
    saveSolutions: (solutions: SaveTestSolutionsInput) => 
      new TestSessionDbStorage(testId, queryClient).saveSolutions(solutions),
    loadProgress: () => new TestSessionDbStorage(testId, queryClient).loadProgress(),
    saveProgress: (progress: SaveTestProgressInput) => 
      new TestSessionDbStorage(testId, queryClient).saveProgress(progress),
    migrateFromLocalStorage: () => 
      new TestSessionDbStorage(testId, queryClient).migrateFromLocalStorage(),
  };
}

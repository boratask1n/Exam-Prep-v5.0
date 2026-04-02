import { Router } from "express";
import { db, testSolutionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function parseId(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function toSolutionInsert(testId: number, questionId: number, solution: any) {
  return {
    testSessionId: testId,
    questionId,
    userAnswer: solution.userAnswer ?? null,
    status: solution.status || "Cozulmedi",
    isCompleted: solution.isCompleted || false,
    canvasData: solution.canvasData ?? null,
    inlineDrawings: solution.inlineDrawings ?? null,
    tempDrawing: solution.tempDrawing ?? null,
    currentIndex: solution.currentIndex ?? 0,
    timer: solution.timer ?? null,
    elapsed: solution.elapsed ?? 0,
    inlineDrawEnabled: solution.inlineDrawEnabled || false,
  };
}

async function getSolutionsByTestId(testId: number) {
  return db
    .select()
    .from(testSolutionsTable)
    .where(eq(testSolutionsTable.testSessionId, testId));
}

router.get("/tests/:testId/solutions", async (req, res) => {
  try {
    const testId = parseId(req.params.testId);
    if (testId === null) {
      return res.status(400).json({ error: "Invalid test ID" });
    }

    const solutions = await getSolutionsByTestId(testId);
    return res.json(solutions);
  } catch (error) {
    console.error("Error fetching test solutions:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

async function saveBulkSolutions(req: any, res: any) {
  try {
    const testId = parseId(req.params.testId);
    if (testId === null) {
      return res.status(400).json({ error: "Invalid test ID" });
    }

    const { solutions } = req.body;
    if (!Array.isArray(solutions)) {
      return res.status(400).json({ error: "Solutions must be an array" });
    }

    const inserted = await db.transaction(async (tx) => {
      await tx
        .delete(testSolutionsTable)
        .where(eq(testSolutionsTable.testSessionId, testId));

      if (solutions.length === 0) {
        return [];
      }

      return tx
        .insert(testSolutionsTable)
        .values(
          solutions.map((solution: any) =>
            toSolutionInsert(testId, solution.questionId, solution),
          ),
        )
        .returning();
    });

    return res.json(inserted);
  } catch (error) {
    console.error("Error saving test solutions:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

router.post("/tests/:testId/solutions", saveBulkSolutions);
router.put("/tests/:testId/solutions", saveBulkSolutions);

router.get("/tests/:testId/questions/:questionId/solution", async (req, res) => {
  try {
    const testId = parseId(req.params.testId);
    const questionId = parseId(req.params.questionId);
    if (testId === null || questionId === null) {
      return res.status(400).json({ error: "Invalid test or question ID" });
    }

    const solutions = await getSolutionsByTestId(testId);
    const solution = solutions.find((item) => item.questionId === questionId);

    if (!solution) {
      return res.status(404).json({ error: "Solution not found" });
    }

    return res.json(solution);
  } catch (error) {
    console.error("Error fetching test question solution:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/tests/:testId/questions/:questionId/solution", async (req, res) => {
  try {
    const testId = parseId(req.params.testId);
    const questionId = parseId(req.params.questionId);
    if (testId === null || questionId === null) {
      return res.status(400).json({ error: "Invalid test or question ID" });
    }

    const solutions = await getSolutionsByTestId(testId);
    const existing = solutions.find((item) => item.questionId === questionId);

    if (existing) {
      const [updated] = await db
        .update(testSolutionsTable)
        .set({
          userAnswer: req.body.userAnswer ?? null,
          status: req.body.status || "Cozulmedi",
          isCompleted: req.body.isCompleted || false,
          canvasData: req.body.canvasData ?? null,
          inlineDrawings: req.body.inlineDrawings ?? null,
          tempDrawing: req.body.tempDrawing ?? null,
          currentIndex: req.body.currentIndex ?? existing.currentIndex ?? 0,
          timer: req.body.timer ?? existing.timer ?? null,
          elapsed: req.body.elapsed ?? existing.elapsed ?? 0,
          inlineDrawEnabled: req.body.inlineDrawEnabled || false,
          updatedAt: new Date(),
        })
        .where(eq(testSolutionsTable.id, existing.id))
        .returning();

      return res.json(updated);
    }

    const [created] = await db
      .insert(testSolutionsTable)
      .values(toSolutionInsert(testId, questionId, req.body))
      .returning();

    return res.json(created);
  } catch (error) {
    console.error("Error saving test question solution:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

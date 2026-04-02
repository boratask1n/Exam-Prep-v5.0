import { Router } from "express";
import { db, testSessionProgressTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function parseId(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

router.get("/tests/:testId/progress", async (req, res) => {
  try {
    const testId = parseId(req.params.testId);
    if (testId === null) {
      return res.status(400).json({ error: "Invalid test ID" });
    }

    const [progress] = await db
      .select()
      .from(testSessionProgressTable)
      .where(eq(testSessionProgressTable.testSessionId, testId));

    return res.json(progress ?? null);
  } catch (error) {
    console.error("Error fetching test progress:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

async function saveProgress(req: any, res: any) {
  try {
    const testId = parseId(req.params.testId);
    if (testId === null) {
      return res.status(400).json({ error: "Invalid test ID" });
    }

    const [existing] = await db
      .select()
      .from(testSessionProgressTable)
      .where(eq(testSessionProgressTable.testSessionId, testId));

    const payload = {
      currentIndex: req.body.currentIndex ?? 0,
      timer: req.body.timer ?? null,
      elapsed: req.body.elapsed ?? 0,
      isCompleted: req.body.isCompleted || false,
      completedAt: req.body.isCompleted ? new Date() : null,
      inlineDrawEnabled: req.body.inlineDrawEnabled || false,
      collapsedLessons: req.body.collapsedLessons ?? null,
      updatedAt: new Date(),
    };

    if (existing) {
      const [updated] = await db
        .update(testSessionProgressTable)
        .set(payload)
        .where(eq(testSessionProgressTable.id, existing.id))
        .returning();

      return res.json(updated);
    }

    const [created] = await db
      .insert(testSessionProgressTable)
      .values({
        testSessionId: testId,
        ...payload,
      })
      .returning();

    return res.json(created);
  } catch (error) {
    console.error("Error saving test progress:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

router.post("/tests/:testId/progress", saveProgress);
router.put("/tests/:testId/progress", saveProgress);

export default router;

import { Router, Request, Response, RequestHandler } from "express";
import { db, practiceExamsTable, insertPracticeExamSchema } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod/v4";
import { getAuthUserId } from "../middlewares/auth";

const router = Router();

// Zod schemas for query parsing
const listQuerySchema = z.object({
  category: z.string().optional(),
  examType: z.string().optional(),
});

// GET /api/practice-exams
router.get("/", (async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const query = listQuerySchema.parse(req.query);
    
    const conditions = [eq(practiceExamsTable.userId, userId)];
    if (query.category) {
      conditions.push(eq(practiceExamsTable.category, query.category));
    }
    if (query.examType) {
      conditions.push(eq(practiceExamsTable.examType, query.examType));
    }

    const exams = await db
      .select()
      .from(practiceExamsTable)
      .where(and(...conditions))
      .orderBy(desc(practiceExamsTable.examDate));

    res.json(exams);
  } catch (error) {
    console.error("List practice exams error:", error);
    res.status(500).json({ error: "Failed to list practice exams" });
  }
}) as RequestHandler);

// GET /api/practice-exams/:id
router.get("/:id", (async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ID format" });
      return;
    }

    const [exam] = await db
      .select()
      .from(practiceExamsTable)
      .where(and(
        eq(practiceExamsTable.id, id),
        eq(practiceExamsTable.userId, userId)
      ))
      .limit(1);

    if (!exam) {
      res.status(404).json({ error: "Practice exam not found" });
      return;
    }

    res.json(exam);
  } catch (error) {
    console.error("Get practice exam error:", error);
    res.status(500).json({ error: "Failed to get practice exam" });
  }
}) as RequestHandler);

// POST /api/practice-exams
router.post("/", (async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const data = insertPracticeExamSchema.parse({
      ...req.body,
      userId,
      examDate: req.body.examDate ? new Date(req.body.examDate) : new Date(),
    });

    const [exam] = await db
      .insert(practiceExamsTable)
      .values(data)
      .returning();

    res.status(201).json(exam);
  } catch (error: any) {
    console.error("Create practice exam error:", error);
    res.status(400).json({ error: error.message || "Invalid practice exam data" });
  }
}) as RequestHandler);

// PUT /api/practice-exams/:id
router.put("/:id", (async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ID format" });
      return;
    }

    const data = insertPracticeExamSchema.partial().parse({
      ...req.body,
      examDate: req.body.examDate ? new Date(req.body.examDate) : undefined,
    });

    const [exam] = await db
      .update(practiceExamsTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(
        eq(practiceExamsTable.id, id),
        eq(practiceExamsTable.userId, userId)
      ))
      .returning();

    if (!exam) {
      res.status(404).json({ error: "Practice exam not found" });
      return;
    }

    res.json(exam);
  } catch (error: any) {
    console.error("Update practice exam error:", error);
    res.status(400).json({ error: error.message || "Invalid data" });
  }
}) as RequestHandler);

// DELETE /api/practice-exams/:id
router.delete("/:id", (async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ID format" });
      return;
    }

    const [deleted] = await db
      .delete(practiceExamsTable)
      .where(and(
        eq(practiceExamsTable.id, id),
        eq(practiceExamsTable.userId, userId)
      ))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Practice exam not found" });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error("Delete practice exam error:", error);
    res.status(500).json({ error: "Failed to delete practice exam" });
  }
}) as RequestHandler);

export default router;

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { questionsTable, testSessionsTable, testSessionQuestionsTable } from "@workspace/db";
import { eq, and, inArray, ilike, sql, count } from "drizzle-orm";
import { CreateTestBody, UpdateTestBody, UpdateTestQuestionStatusBody } from "@workspace/api-zod";

const router: IRouter = Router();

async function buildTestSessionResponse(id: number) {
  const [session] = await db.select().from(testSessionsTable).where(eq(testSessionsTable.id, id));
  if (!session) return null;

  const sessionQuestions = await db
    .select({ questionId: testSessionQuestionsTable.questionId })
    .from(testSessionQuestionsTable)
    .where(eq(testSessionQuestionsTable.testSessionId, id))
    .orderBy(testSessionQuestionsTable.orderIndex);

  const qIds = sessionQuestions.map((sq) => sq.questionId);
  let questions: Array<Record<string, unknown>> = [];
  if (qIds.length > 0) {
    const qs = await db.select().from(questionsTable).where(inArray(questionsTable.id, qIds));
    const orderedQs = qIds.map((qId) => qs.find((q) => q.id === qId)).filter(Boolean);
    questions = orderedQs.map((q) => ({
      ...q,
      createdAt: q!.createdAt.toISOString(),
      updatedAt: q!.updatedAt.toISOString(),
    }));
  }

  return {
    id: session.id,
    name: session.name,
    timeLimitSeconds: session.timeLimitSeconds ?? null,
    completedAt: session.completedAt ? session.completedAt.toISOString() : null,
    questions,
    createdAt: session.createdAt.toISOString(),
  };
}

router.get("/tests", async (req, res) => {
  const sessions = await db
    .select({
      id: testSessionsTable.id,
      name: testSessionsTable.name,
      timeLimitSeconds: testSessionsTable.timeLimitSeconds,
      completedAt: testSessionsTable.completedAt,
      createdAt: testSessionsTable.createdAt,
      questionCount: count(testSessionQuestionsTable.id),
    })
    .from(testSessionsTable)
    .leftJoin(testSessionQuestionsTable, eq(testSessionQuestionsTable.testSessionId, testSessionsTable.id))
    .groupBy(
      testSessionsTable.id,
      testSessionsTable.name,
      testSessionsTable.timeLimitSeconds,
      testSessionsTable.completedAt,
      testSessionsTable.createdAt,
    )
    .orderBy(testSessionsTable.createdAt);

  const result = await Promise.all(
    sessions.map(async (s) => {
      const qs = await db
        .select({ questionId: testSessionQuestionsTable.questionId })
        .from(testSessionQuestionsTable)
        .where(eq(testSessionQuestionsTable.testSessionId, s.id));

      const qIds = qs.map((q) => q.questionId);
      let completedCount = 0;
      if (qIds.length > 0) {
        const completed = await db
          .select({ id: questionsTable.id })
          .from(questionsTable)
          .where(and(inArray(questionsTable.id, qIds), eq(questionsTable.status, "DogruCozuldu")));
        completedCount = completed.length;
      }

      return {
        id: s.id,
        name: s.name,
        timeLimitSeconds: s.timeLimitSeconds ?? null,
        completedAt: s.completedAt ? s.completedAt.toISOString() : null,
        questionCount: s.questionCount,
        completedCount,
        createdAt: s.createdAt.toISOString(),
      };
    })
  );

  res.json(result);
});

router.post("/tests", async (req, res) => {
  const body = CreateTestBody.parse(req.body);

  let questionIds: number[] = [];

  if (body.questionIds && body.questionIds.length > 0) {
    questionIds = body.questionIds;
  } else {
    const conditions = [];
    const filters = body.filters;
    if (filters) {
      if (filters.category) conditions.push(eq(questionsTable.category, filters.category));
      if (filters.source) conditions.push(eq(questionsTable.source, filters.source));
      if (filters.topic) conditions.push(ilike(questionsTable.topic!, `%${filters.topic}%`));
      if (filters.publisher) conditions.push(ilike(questionsTable.publisher!, `%${filters.publisher}%`));
      if (filters.status) conditions.push(eq(questionsTable.status, filters.status));
    }

    // Handle multiple lessons filter
    const lessons = filters?.lessons;
    if (lessons && lessons.length > 0) {
      const lessonConditions = lessons.map((l) => ilike(questionsTable.lesson, `%${l}%`));
      // Use OR across lessons
      const { or } = await import("drizzle-orm");
      conditions.push(or(...lessonConditions)!);
    }

    const poolQuery = db
      .select({ id: questionsTable.id, lesson: questionsTable.lesson })
      .from(questionsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(sql`RANDOM()`);

    if (body.count) {
      poolQuery.limit(body.count);
    }

    const pool = await poolQuery;
    // Sort by lesson so grouped questions come together
    pool.sort((a, b) => a.lesson.localeCompare(b.lesson));
    questionIds = pool.map((q) => q.id);
  }

  const [session] = await db
    .insert(testSessionsTable)
    .values({ name: body.name, timeLimitSeconds: body.timeLimitSeconds ?? null })
    .returning();

  if (questionIds.length > 0) {
    await db.insert(testSessionQuestionsTable).values(
      questionIds.map((qId, idx) => ({
        testSessionId: session.id,
        questionId: qId,
        orderIndex: idx,
      }))
    );
  }

  res.status(201).json({
    id: session.id,
    name: session.name,
    timeLimitSeconds: session.timeLimitSeconds ?? null,
    completedAt: null,
    questionCount: questionIds.length,
    completedCount: 0,
    createdAt: session.createdAt.toISOString(),
  });
});

router.get("/tests/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const data = await buildTestSessionResponse(id);
  if (!data) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(data);
});

router.patch("/tests/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const body = UpdateTestBody.parse(req.body);
  const updateData: Record<string, unknown> = {};
  if (body.completedAt !== undefined) {
    updateData.completedAt = body.completedAt ? new Date(body.completedAt) : null;
  }
  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  const [session] = await db
    .update(testSessionsTable)
    .set(updateData)
    .where(eq(testSessionsTable.id, id))
    .returning();
  if (!session) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const data = await buildTestSessionResponse(id);
  if (!data) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(data);
});

router.delete("/tests/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(testSessionsTable).where(eq(testSessionsTable.id, id));
  res.status(204).send();
});

router.patch("/tests/:id/questions/:questionId/status", async (req, res) => {
  const questionId = parseInt(req.params.questionId);
  const body = UpdateTestQuestionStatusBody.parse(req.body);

  const [question] = await db
    .update(questionsTable)
    .set({ status: body.status, updatedAt: new Date() })
    .where(eq(questionsTable.id, questionId))
    .returning();

  if (!question) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...question, createdAt: question.createdAt.toISOString(), updatedAt: question.updatedAt.toISOString() });
});

export default router;

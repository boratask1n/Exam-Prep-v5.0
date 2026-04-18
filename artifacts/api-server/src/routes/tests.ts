import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  questionsTable,
  testResultSummariesTable,
  testSessionsTable,
  testSessionQuestionsTable,
} from "@workspace/db";
import { eq, and, inArray, ilike, sql, count, or, desc } from "drizzle-orm";
import { CreateTestBody, UpdateTestBody, UpdateTestQuestionStatusBody } from "@workspace/api-zod";
import { finalizeTestResult } from "../services/testResultService";
import { getAuthUserId } from "../middlewares/auth";

const router: IRouter = Router();

function buildTopicCondition(topics: string[] | undefined) {
  if (!topics?.length) return undefined;

  const topicConditions = topics.map((topic) =>
    ilike(questionsTable.topic!, `%${topic}%`),
  );
  return topicConditions.length === 1
    ? topicConditions[0]
    : or(...topicConditions);
}

async function buildTestSessionResponse(userId: number, id: number) {
  const [session] = await db.select().from(testSessionsTable).where(and(eq(testSessionsTable.id, id), eq(testSessionsTable.userId, userId)));
  if (!session) return null;

  const sessionQuestions = await db
    .select({ questionId: testSessionQuestionsTable.questionId })
    .from(testSessionQuestionsTable)
    .where(eq(testSessionQuestionsTable.testSessionId, id))
    .orderBy(testSessionQuestionsTable.orderIndex);

  const qIds = sessionQuestions.map((sq) => sq.questionId);
  let questions: Array<Record<string, unknown>> = [];
  if (qIds.length > 0) {
    const qs = await db.select().from(questionsTable).where(and(inArray(questionsTable.id, qIds), eq(questionsTable.userId, userId)));
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
  const userId = getAuthUserId(req);
  const sessions = await db
    .select({
      id: testSessionsTable.id,
      name: testSessionsTable.name,
      timeLimitSeconds: testSessionsTable.timeLimitSeconds,
      completedAt: testSessionsTable.completedAt,
      createdAt: testSessionsTable.createdAt,
      questionCount: count(testSessionQuestionsTable.id),
      completedCount: sql<number>`count(${questionsTable.id})::int`,
    })
    .from(testSessionsTable)
    .leftJoin(testSessionQuestionsTable, eq(testSessionQuestionsTable.testSessionId, testSessionsTable.id))
    .leftJoin(
      questionsTable,
      and(
        eq(questionsTable.id, testSessionQuestionsTable.questionId),
        eq(questionsTable.userId, userId),
        eq(questionsTable.status, "DogruCozuldu"),
      ),
    )
    .where(eq(testSessionsTable.userId, userId))
    .groupBy(
      testSessionsTable.id,
      testSessionsTable.name,
      testSessionsTable.timeLimitSeconds,
      testSessionsTable.completedAt,
      testSessionsTable.createdAt,
    )
    .orderBy(desc(testSessionsTable.createdAt));

  const result = sessions.map((s) => ({
    id: s.id,
    name: s.name,
    timeLimitSeconds: s.timeLimitSeconds ?? null,
    completedAt: s.completedAt ? s.completedAt.toISOString() : null,
    questionCount: s.questionCount,
    completedCount: Number(s.completedCount ?? 0),
    createdAt: s.createdAt.toISOString(),
  }));

  res.json(result);
});

router.post("/tests", async (req, res) => {
  const userId = getAuthUserId(req);
  const body = CreateTestBody.parse(req.body);

  let questionIds: number[] = [];

  if (body.questionIds && body.questionIds.length > 0) {
    const ownedRows = await db
      .select({ id: questionsTable.id })
      .from(questionsTable)
      .where(and(inArray(questionsTable.id, body.questionIds), eq(questionsTable.userId, userId)));
    const owned = new Set(ownedRows.map((row) => row.id));
    questionIds = body.questionIds.filter((id) => owned.has(id));
  } else {
    const conditions = [eq(questionsTable.userId, userId)];
    const filters = body.filters;
    if (filters) {
      if (filters.category) conditions.push(eq(questionsTable.category, filters.category));
      if (filters.source) conditions.push(eq(questionsTable.source, filters.source));
      const topics = filters.topics?.length
        ? filters.topics
        : filters.topic
          ? [filters.topic]
          : [];
      const topicCondition = buildTopicCondition(topics);
      if (topicCondition) conditions.push(topicCondition);
      if (filters.publisher) conditions.push(ilike(questionsTable.publisher!, `%${filters.publisher}%`));
      if (filters.status) conditions.push(eq(questionsTable.status, filters.status));
    }

    // Handle multiple lessons filter
    const lessons = filters?.lessons;
    if (lessons && lessons.length > 0) {
      const lessonConditions = lessons.map((l: string) => ilike(questionsTable.lesson, `%${l}%`));
      conditions.push(or(...lessonConditions)!);
    }

    const baseWhere = conditions.length > 0 ? and(...conditions) : undefined;
    const requestedCount =
      body.count ??
      Object.values(body.distribution ?? {}).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
    const distributionEntries = Object.entries(body.distribution ?? {}).filter(
      ([lesson, amount]) => lesson && Number.isFinite(amount) && amount > 0,
    );

    if (distributionEntries.length > 0) {
      const distributedQuestions = await Promise.all(
        distributionEntries.map(async ([lesson, amount]) => {
          const lessonWhere = and(
            ...(baseWhere ? [baseWhere] : []),
            ilike(questionsTable.lesson, `%${lesson}%`),
          );

          return db
            .select({ id: questionsTable.id, lesson: questionsTable.lesson })
            .from(questionsTable)
            .where(lessonWhere)
            .orderBy(sql`RANDOM()`)
            .limit(amount);
        }),
      );

      questionIds = distributedQuestions
        .flat()
        .sort((a, b) => a.lesson.localeCompare(b.lesson))
        .map((q) => q.id);
    } else {
      const poolQuery = db
        .select({ id: questionsTable.id, lesson: questionsTable.lesson })
        .from(questionsTable)
        .where(baseWhere)
        .orderBy(sql`RANDOM()`);

      if (body.count) {
        poolQuery.limit(body.count);
      }

      const pool = await poolQuery;
      pool.sort((a, b) => a.lesson.localeCompare(b.lesson));
      questionIds = pool.map((q) => q.id);
    }

    // If we could not reach requested count, fill with all remaining matching questions.
    // Also relax only "status" filter as last resort so AI-generated tests are not empty.
    if (requestedCount > 0 && questionIds.length < requestedCount) {
      const fallbackConditions = [eq(questionsTable.userId, userId)];
      if (filters) {
        if (filters.category) fallbackConditions.push(eq(questionsTable.category, filters.category));
        if (filters.source) fallbackConditions.push(eq(questionsTable.source, filters.source));
        const topics = filters.topics?.length
          ? filters.topics
          : filters.topic
            ? [filters.topic]
            : [];
        const topicCondition = buildTopicCondition(topics);
        if (topicCondition) fallbackConditions.push(topicCondition);
        if (filters.publisher) fallbackConditions.push(ilike(questionsTable.publisher!, `%${filters.publisher}%`));
      }
      const fallbackLessons = filters?.lessons;
      if (fallbackLessons && fallbackLessons.length > 0) {
        const lessonConditions = fallbackLessons.map((l: string) => ilike(questionsTable.lesson, `%${l}%`));
        fallbackConditions.push(or(...lessonConditions)!);
      }

      const fallbackWhere = fallbackConditions.length > 0 ? and(...fallbackConditions) : undefined;
      const fallbackPool = await db
        .select({ id: questionsTable.id, lesson: questionsTable.lesson })
        .from(questionsTable)
        .where(fallbackWhere)
        .orderBy(sql`RANDOM()`);

      const existing = new Set(questionIds);
      for (const q of fallbackPool) {
        if (existing.has(q.id)) continue;
        questionIds.push(q.id);
        existing.add(q.id);
        if (questionIds.length >= requestedCount) break;
      }
    }
  }

  if (questionIds.length === 0) {
    res.status(400).json({
      error: "Filtrelere uygun soru bulunamadı",
      code: "NO_QUESTIONS_MATCHED",
    });
    return;
  }

  const [session] = await db
    .insert(testSessionsTable)
      .values({ userId, name: body.name, timeLimitSeconds: body.timeLimitSeconds ?? null })
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

  return res.status(201).json({
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
  const userId = getAuthUserId(req);
  const id = parseInt(req.params.id);
  const data = await buildTestSessionResponse(userId, id);
  if (!data) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(data);
});

router.patch("/tests/:id", async (req, res) => {
  const userId = getAuthUserId(req);
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
    .where(and(eq(testSessionsTable.id, id), eq(testSessionsTable.userId, userId)))
    .returning();
  if (!session) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const data = await buildTestSessionResponse(userId, id);
  if (!data) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (body.completedAt) {
    try {
      await finalizeTestResult(userId, id);
    } catch (error) {
      console.error("Error finalizing analytics snapshot on test completion:", error);
    }
  }

  res.json(data);
});

router.delete("/tests/:id", async (req, res) => {
  const userId = getAuthUserId(req);
  const id = parseInt(req.params.id);
  await db.delete(testSessionsTable).where(and(eq(testSessionsTable.id, id), eq(testSessionsTable.userId, userId)));
  res.status(204).send();
});

router.delete("/tests/:id/analytics", async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const id = parseInt(req.params.id);
    await db.delete(testResultSummariesTable).where(and(eq(testResultSummariesTable.testSessionId, id), eq(testResultSummariesTable.userId, userId)));
    res.status(204).send();
  } catch (error) {
    console.error("Failed to delete analytics snapshot:", error);
    res.status(500).json({ error: "Failed to delete analytics snapshot" });
  }
});

router.patch("/tests/:id/questions/:questionId/status", async (req, res) => {
  const userId = getAuthUserId(req);
  const questionId = parseInt(req.params.questionId);
  const body = UpdateTestQuestionStatusBody.parse(req.body);

  const [question] = await db
    .update(questionsTable)
    .set({ status: body.status, updatedAt: new Date() })
    .where(and(eq(questionsTable.id, questionId), eq(questionsTable.userId, userId)))
    .returning();

  if (!question) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...question, createdAt: question.createdAt.toISOString(), updatedAt: question.updatedAt.toISOString() });
});

export default router;

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { resourcesTable, questionsTable, notesTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { getAuthUserId } from "../middlewares/auth";

const router: IRouter = Router();

function parseOptionalString(val: unknown): string | undefined {
  return typeof val === "string" && val.trim() !== "" ? val.trim() : undefined;
}

function parseOptionalInt(val: unknown): number | null | undefined {
  if (val === null) return null;
  if (typeof val === "number") return Math.round(val);
  if (typeof val === "string" && val.trim() !== "") {
    const parsed = Number.parseInt(val, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function serializeResource(r: any) {
  return {
    id: r.id,
    userId: r.userId,
    name: r.name,
    publisher: r.publisher ?? null,
    category: r.category,
    lesson: r.lesson ?? null,
    topic: r.topic ?? null,
    resourceType: r.resourceType,
    targetQuestionCount: r.targetQuestionCount ?? 0,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
  };
}

// GET /api/resources
router.get("/", async (req, res) => {
  const userId = getAuthUserId(req);
  const { category, lesson, topic, resourceType } = req.query;

  const conditions = [eq(resourcesTable.userId, userId)];
  if (typeof category === "string" && category.trim()) {
    conditions.push(eq(resourcesTable.category, category.trim()));
  }
  if (typeof lesson === "string" && lesson.trim()) {
    conditions.push(eq(resourcesTable.lesson, lesson.trim()));
  }
  if (typeof topic === "string" && topic.trim()) {
    conditions.push(eq(resourcesTable.topic, topic.trim()));
  }
  if (typeof resourceType === "string" && resourceType.trim()) {
    conditions.push(eq(resourcesTable.resourceType, resourceType.trim()));
  }

  const resources = await db
    .select()
    .from(resourcesTable)
    .where(and(...conditions))
    .orderBy(desc(resourcesTable.updatedAt));

  // Get question & note stats per resource for this user
  const questionStats = await db
    .select({
      resourceId: questionsTable.resourceId,
      total: sql<number>`count(${questionsTable.id})::int`,
      solved: sql<number>`count(case when ${questionsTable.status} != 'Cozulmedi' then 1 end)::int`,
      correct: sql<number>`count(case when ${questionsTable.status} = 'DogruCozuldu' then 1 end)::int`,
      wrong: sql<number>`count(case when ${questionsTable.status} = 'YanlisHocayaSor' then 1 end)::int`,
    })
    .from(questionsTable)
    .where(eq(questionsTable.userId, userId))
    .groupBy(questionsTable.resourceId);

  const noteStats = await db
    .select({
      resourceId: notesTable.resourceId,
      total: sql<number>`count(${notesTable.id})::int`,
    })
    .from(notesTable)
    .where(eq(notesTable.userId, userId))
    .groupBy(notesTable.resourceId);

  const topicStatsRows = await db
    .select({
      resourceId: questionsTable.resourceId,
      topic: questionsTable.topic,
      lesson: questionsTable.lesson,
      total: sql<number>`count(${questionsTable.id})::int`,
      solved: sql<number>`count(case when ${questionsTable.status} != 'Cozulmedi' then 1 end)::int`,
      correct: sql<number>`count(case when ${questionsTable.status} = 'DogruCozuldu' then 1 end)::int`,
      wrong: sql<number>`count(case when ${questionsTable.status} = 'YanlisHocayaSor' then 1 end)::int`,
    })
    .from(questionsTable)
    .where(and(eq(questionsTable.userId, userId), sql`${questionsTable.topic} is not null and ${questionsTable.topic} != ''`))
    .groupBy(questionsTable.resourceId, questionsTable.topic, questionsTable.lesson);

  const qMap = new Map(questionStats.map((s) => [s.resourceId, s]));
  const nMap = new Map(noteStats.map((s) => [s.resourceId, s]));
  const topicMap = new Map<number, Array<{ topic: string; lesson: string; total: number; solved: number; correct: number; wrong: number }>>();

  for (const t of topicStatsRows) {
    if (!t.resourceId || !t.topic) continue;
    const list = topicMap.get(t.resourceId) ?? [];
    list.push({
      topic: t.topic,
      lesson: t.lesson || "",
      total: t.total,
      solved: t.solved,
      correct: t.correct,
      wrong: t.wrong,
    });
    topicMap.set(t.resourceId, list);
  }

  const result = resources.map((r) => {
    const q = qMap.get(r.id);
    const n = nMap.get(r.id);
    return {
      ...serializeResource(r),
      totalQuestions: q?.total ?? 0,
      solvedQuestions: q?.solved ?? 0,
      correctQuestions: q?.correct ?? 0,
      wrongQuestions: q?.wrong ?? 0,
      totalNotes: n?.total ?? 0,
      topicStats: topicMap.get(r.id) ?? [],
    };
  });

  return res.json(result);
});

// GET /api/resources/:id
router.get("/:id", async (req, res) => {
  const userId = getAuthUserId(req);
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid resource ID" });
  }

  const [resource] = await db
    .select()
    .from(resourcesTable)
    .where(and(eq(resourcesTable.id, id), eq(resourcesTable.userId, userId)));

  if (!resource) {
    return res.status(404).json({ error: "Resource not found" });
  }

  const [qStat] = await db
    .select({
      total: sql<number>`count(${questionsTable.id})::int`,
      solved: sql<number>`count(case when ${questionsTable.status} != 'Cozulmedi' then 1 end)::int`,
      correct: sql<number>`count(case when ${questionsTable.status} = 'DogruCozuldu' then 1 end)::int`,
      wrong: sql<number>`count(case when ${questionsTable.status} = 'YanlisHocayaSor' then 1 end)::int`,
    })
    .from(questionsTable)
    .where(and(eq(questionsTable.userId, userId), eq(questionsTable.resourceId, id)));

  const [nStat] = await db
    .select({
      total: sql<number>`count(${notesTable.id})::int`,
    })
    .from(notesTable)
    .where(and(eq(notesTable.userId, userId), eq(notesTable.resourceId, id)));

  const topicStatsRows = await db
    .select({
      topic: questionsTable.topic,
      lesson: questionsTable.lesson,
      total: sql<number>`count(${questionsTable.id})::int`,
      solved: sql<number>`count(case when ${questionsTable.status} != 'Cozulmedi' then 1 end)::int`,
      correct: sql<number>`count(case when ${questionsTable.status} = 'DogruCozuldu' then 1 end)::int`,
      wrong: sql<number>`count(case when ${questionsTable.status} = 'YanlisHocayaSor' then 1 end)::int`,
    })
    .from(questionsTable)
    .where(and(eq(questionsTable.userId, userId), eq(questionsTable.resourceId, id), sql`${questionsTable.topic} is not null and ${questionsTable.topic} != ''`))
    .groupBy(questionsTable.topic, questionsTable.lesson);

  const topicStats = topicStatsRows
    .filter((t) => t.topic)
    .map((t) => ({
      topic: t.topic!,
      lesson: t.lesson || "",
      total: t.total,
      solved: t.solved,
      correct: t.correct,
      wrong: t.wrong,
    }));

  return res.json({
    ...serializeResource(resource),
    totalQuestions: qStat?.total ?? 0,
    solvedQuestions: qStat?.solved ?? 0,
    correctQuestions: qStat?.correct ?? 0,
    wrongQuestions: qStat?.wrong ?? 0,
    totalNotes: nStat?.total ?? 0,
    topicStats,
  });
});

// POST /api/resources
router.post("/", async (req, res) => {
  const userId = getAuthUserId(req);
  const { name, publisher, category, lesson, topic, resourceType, targetQuestionCount } = req.body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Kaynak adı zorunludur" });
  }

  if (!lesson || typeof lesson !== "string" || !lesson.trim()) {
    return res.status(400).json({ error: "İlgili ders seçimi zorunludur" });
  }

  const [created] = await db
    .insert(resourcesTable)
    .values({
      userId,
      name: name.trim(),
      publisher: parseOptionalString(publisher) ?? null,
      category: parseOptionalString(category) ?? "TYT",
      lesson: parseOptionalString(lesson) ?? null,
      topic: parseOptionalString(topic) ?? null,
      resourceType: parseOptionalString(resourceType) ?? "Soru Bankası",
      targetQuestionCount: parseOptionalInt(targetQuestionCount) ?? 0,
    })
    .returning();

  return res.status(201).json(serializeResource(created));
});

// PUT /api/resources/:id
router.put("/:id", async (req, res) => {
  const userId = getAuthUserId(req);
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid resource ID" });
  }

  const [existing] = await db
    .select()
    .from(resourcesTable)
    .where(and(eq(resourcesTable.id, id), eq(resourcesTable.userId, userId)));

  if (!existing) {
    return res.status(404).json({ error: "Resource not found" });
  }

  const { name, publisher, category, lesson, topic, resourceType, targetQuestionCount } = req.body;

  if (name !== undefined && (!name || typeof name !== "string" || !name.trim())) {
    return res.status(400).json({ error: "Kaynak adı zorunludur" });
  }

  if (lesson !== undefined && (!lesson || typeof lesson !== "string" || !lesson.trim())) {
    return res.status(400).json({ error: "İlgili ders seçimi zorunludur" });
  }

  const [updated] = await db
    .update(resourcesTable)
    .set({
      name: parseOptionalString(name) ?? existing.name,
      publisher: publisher !== undefined ? parseOptionalString(publisher) ?? null : existing.publisher,
      category: parseOptionalString(category) ?? existing.category,
      lesson: lesson !== undefined ? parseOptionalString(lesson) ?? null : existing.lesson,
      topic: topic !== undefined ? parseOptionalString(topic) ?? null : existing.topic,
      resourceType: parseOptionalString(resourceType) ?? existing.resourceType,
      targetQuestionCount:
        targetQuestionCount !== undefined ? parseOptionalInt(targetQuestionCount) ?? 0 : existing.targetQuestionCount,
      updatedAt: new Date(),
    })
    .where(and(eq(resourcesTable.id, id), eq(resourcesTable.userId, userId)))
    .returning();

  return res.json(serializeResource(updated));
});

// DELETE /api/resources/:id
router.delete("/:id", async (req, res) => {
  const userId = getAuthUserId(req);
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid resource ID" });
  }

  const [deleted] = await db
    .delete(resourcesTable)
    .where(and(eq(resourcesTable.id, id), eq(resourcesTable.userId, userId)))
    .returning();

  if (!deleted) {
    return res.status(404).json({ error: "Resource not found" });
  }

  return res.status(204).send();
});

export default router;

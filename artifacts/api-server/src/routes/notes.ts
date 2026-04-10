import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import * as dbSchema from "@workspace/db";

const notesTable = (dbSchema as any).notesTable;
const noteReviewStatsTable = (dbSchema as any).noteReviewStatsTable;
const router: IRouter = Router();

type NoteCategory = "TYT" | "AYT";
type NoteType = "text" | "drawing";

const REVIEW_INTERVAL_MINUTES = [0, 12, 90, 720, 1440, 4320, 10080, 20160];
const MIN_SERVE_GAP_MS = 45 * 1000;

function parseNoteCategory(value: unknown, fallback?: NoteCategory): NoteCategory {
  return value === "AYT" ? "AYT" : value === "TYT" ? "TYT" : fallback ?? "TYT";
}

function parseNoteType(value: unknown, fallback?: NoteType): NoteType {
  return value === "drawing" ? "drawing" : value === "text" ? "text" : fallback ?? "text";
}

function parseOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function parseNullableString(value: unknown) {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function parseBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function parseExcludeIds(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") return [] as string[];
  return value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function serializeNote(note: any) {
  return {
    ...note,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    lastServedAt: note.lastServedAt instanceof Date ? note.lastServedAt.toISOString() : null,
    nextEligibleAt: note.nextEligibleAt instanceof Date ? note.nextEligibleAt.toISOString() : null,
  };
}

function createNoteId() {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getReviewDueAt(row: any) {
  return row.nextEligibleAt instanceof Date ? row.nextEligibleAt : row.createdAt;
}

function buildFeedScore(row: any, now: Date) {
  const dueAt = getReviewDueAt(row);
  const totalServed = typeof row.totalServed === "number" ? row.totalServed : 0;
  const repetitionStage = typeof row.repetitionStage === "number" ? row.repetitionStage : 0;
  const lastServedAt = row.lastServedAt instanceof Date ? row.lastServedAt : null;
  const isDue = dueAt.getTime() <= now.getTime();
  const minutesOverdue = isDue ? Math.max(0, (now.getTime() - dueAt.getTime()) / 60000) : 0;
  const minutesUntilDue = !isDue ? Math.max(0, (dueAt.getTime() - now.getTime()) / 60000) : 0;
  const unseenBoost = totalServed === 0 ? 180 : 0;
  const pinnedBoost = row.pinned ? 22 : 0;
  const categoryVarietyBoost = row.category === "AYT" ? 4 : 0;
  const cooldownPenalty =
    lastServedAt && now.getTime() - lastServedAt.getTime() < MIN_SERVE_GAP_MS * 6 ? -140 : 0;
  const stagePenalty = repetitionStage * 8;
  const dueBoost = isDue
    ? 140 + Math.min(80, minutesOverdue / 12)
    : Math.max(-70, -(minutesUntilDue / 20));

  return unseenBoost + pinnedBoost + categoryVarietyBoost + cooldownPenalty + dueBoost - stagePenalty;
}

function pickWeightedNotes<T extends { score: number }>(rows: T[], limit: number) {
  const pool = [...rows];
  const selected: T[] = [];

  while (pool.length > 0 && selected.length < limit) {
    const weights = pool.map((row) => Math.max(1, row.score + 220));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let threshold = Math.random() * totalWeight;
    let chosenIndex = 0;

    for (let index = 0; index < pool.length; index += 1) {
      threshold -= weights[index];
      if (threshold <= 0) {
        chosenIndex = index;
        break;
      }
    }

    selected.push(pool[chosenIndex]);
    pool.splice(chosenIndex, 1);
  }

  return selected;
}

function getNextEligibleFromStage(stage: number, now: Date) {
  const normalizedStage = Math.max(0, Math.min(stage, REVIEW_INTERVAL_MINUTES.length - 1));
  const intervalMinutes = REVIEW_INTERVAL_MINUTES[normalizedStage];
  return new Date(now.getTime() + intervalMinutes * 60 * 1000);
}

router.get("/notes", async (req, res) => {
  const category = parseNoteCategory(req.query.category, undefined);
  const lesson = parseOptionalString(req.query.lesson);
  const search = parseOptionalString(req.query.search);
  const rawLimit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : Number.NaN;
  const rawOffset = typeof req.query.offset === "string" ? Number.parseInt(req.query.offset, 10) : Number.NaN;
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 60) : 9;
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
  const conditions = [];

  if (req.query.category) conditions.push(eq(notesTable.category, category));
  if (lesson) conditions.push(ilike(notesTable.lesson, `%${lesson}%`));
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        sql`coalesce(${notesTable.title}, '') ilike ${pattern}`,
        sql`coalesce(${notesTable.topic}, '') ilike ${pattern}`,
        sql`coalesce(${notesTable.description}, '') ilike ${pattern}`,
        sql`coalesce(${notesTable.lesson}, '') ilike ${pattern}`,
      )!,
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const countRows = (await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(notesTable)
    .where(whereClause)) as Array<{ count: number }>;
  const total = countRows[0]?.count ?? 0;

  const rows = (await db
    .select()
    .from(notesTable)
    .where(whereClause)
    .orderBy(desc(notesTable.pinned), desc(notesTable.updatedAt))
    .limit(limit)
    .offset(offset)) as any[];

  res.json({
    items: rows.map(serializeNote),
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    },
  });
});

router.get("/notes/feed", async (req, res) => {
  const search = parseOptionalString(req.query.search);
  const excludeIds = parseExcludeIds(req.query.excludeIds);
  const rawLimit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : Number.NaN;
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 12) : 6;
  const conditions = [];

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        sql`coalesce(${notesTable.title}, '') ilike ${pattern}`,
        sql`coalesce(${notesTable.topic}, '') ilike ${pattern}`,
        sql`coalesce(${notesTable.description}, '') ilike ${pattern}`,
        sql`coalesce(${notesTable.lesson}, '') ilike ${pattern}`,
      )!,
    );
  }
  if (excludeIds.length > 0) {
    conditions.push(sql`${notesTable.id} not in (${sql.join(excludeIds.map((id) => sql`${id}`), sql`, `)})`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = (await db
    .select({
      id: notesTable.id,
      category: notesTable.category,
      lesson: notesTable.lesson,
      title: notesTable.title,
      topic: notesTable.topic,
      noteType: notesTable.noteType,
      description: notesTable.description,
      drawingData: notesTable.drawingData,
      pinned: notesTable.pinned,
      createdAt: notesTable.createdAt,
      updatedAt: notesTable.updatedAt,
      totalServed: noteReviewStatsTable.totalServed,
      repetitionStage: noteReviewStatsTable.repetitionStage,
      lastServedAt: noteReviewStatsTable.lastServedAt,
      nextEligibleAt: noteReviewStatsTable.nextEligibleAt,
    })
    .from(notesTable)
    .leftJoin(noteReviewStatsTable, eq(noteReviewStatsTable.noteId, notesTable.id))
    .where(whereClause)) as any[];

  const now = new Date();
  const scoredRows = rows.map((row) => ({ ...row, score: buildFeedScore(row, now) })).sort((left, right) => right.score - left.score);
  const candidatePool = scoredRows.slice(0, Math.max(limit * 4, 12));
  const selected = pickWeightedNotes(candidatePool, limit).sort((left, right) => right.score - left.score).map((row) => serializeNote(row));

  res.json({
    items: selected,
    pagination: {
      total: rows.length,
      limit,
      offset: 0,
      hasMore: rows.length > selected.length,
    },
    algorithm: {
      name: "active-recall-spaced-feed",
      description: "Yeni notları önce sık, sonra açılan aralıklarla tekrar gösterir.",
    },
  });
});

router.post("/notes/feed/serve/:id", async (req, res) => {
  const noteId = req.params.id;
  const noteRows = (await db.select().from(notesTable).where(eq(notesTable.id, noteId)).limit(1)) as any[];
  const note = noteRows[0];

  if (!note) {
    res.status(404).json({ error: "Not bulunamadı" });
    return;
  }

  const existingRows = (await db.select().from(noteReviewStatsTable).where(eq(noteReviewStatsTable.noteId, noteId)).limit(1)) as any[];
  const existing = existingRows[0];
  const now = new Date();

  if (existing?.lastServedAt instanceof Date && now.getTime() - existing.lastServedAt.getTime() < MIN_SERVE_GAP_MS) {
    res.json({ ok: true, deduped: true });
    return;
  }

  const currentStage = typeof existing?.repetitionStage === "number" ? existing.repetitionStage : 0;
  const nextStage = Math.min(currentStage + 1, REVIEW_INTERVAL_MINUTES.length - 1);
  const intervalMinutes = REVIEW_INTERVAL_MINUTES[nextStage];
  const nextEligibleAt = new Date(now.getTime() + intervalMinutes * 60 * 1000);

  if (existing) {
    await db
      .update(noteReviewStatsTable)
      .set({
        totalServed: (existing.totalServed ?? 0) + 1,
        repetitionStage: nextStage,
        lastServedAt: now,
        nextEligibleAt,
        updatedAt: now,
      })
      .where(eq(noteReviewStatsTable.noteId, noteId));
  } else {
    await db.insert(noteReviewStatsTable).values({
      noteId,
      totalServed: 1,
      repetitionStage: nextStage,
      lastServedAt: now,
      nextEligibleAt,
      updatedAt: now,
    });
  }

  res.json({
    ok: true,
    repetitionStage: nextStage,
    nextEligibleAt: nextEligibleAt.toISOString(),
  });
});

router.post("/notes/feed/feedback/:id", async (req, res) => {
  const noteId = req.params.id;
  const feedback = typeof req.body?.feedback === "string" ? req.body.feedback : "";
  const noteRows = (await db.select().from(notesTable).where(eq(notesTable.id, noteId)).limit(1)) as any[];
  const note = noteRows[0];

  if (!note) {
    res.status(404).json({ error: "Not bulunamadı" });
    return;
  }

  if (!["again", "hard", "easy", "less_often", "more_often"].includes(feedback)) {
    res.status(400).json({ error: "Geçersiz geri bildirim" });
    return;
  }

  const existingRows = (await db.select().from(noteReviewStatsTable).where(eq(noteReviewStatsTable.noteId, noteId)).limit(1)) as any[];
  const existing = existingRows[0];
  const now = new Date();
  const baseStage = typeof existing?.repetitionStage === "number" ? existing.repetitionStage : 0;

  let nextStage = baseStage;
  if (feedback === "again") nextStage = 0;
  if (feedback === "hard") nextStage = Math.max(1, baseStage);
  if (feedback === "easy") nextStage = Math.min(baseStage + 2, REVIEW_INTERVAL_MINUTES.length - 1);
  if (feedback === "less_often") nextStage = Math.min(baseStage + 3, REVIEW_INTERVAL_MINUTES.length - 1);
  if (feedback === "more_often") nextStage = Math.max(0, baseStage - 1);

  const nextEligibleAt =
    feedback === "again"
      ? new Date(now.getTime() + 8 * 60 * 1000)
      : feedback === "hard"
        ? new Date(now.getTime() + Math.max(20, REVIEW_INTERVAL_MINUTES[nextStage]) * 60 * 1000)
        : feedback === "less_often"
          ? new Date(now.getTime() + Math.max(720, REVIEW_INTERVAL_MINUTES[nextStage]) * 60 * 1000)
          : feedback === "more_often"
            ? new Date(now.getTime() + 15 * 60 * 1000)
          : getNextEligibleFromStage(nextStage, now);

  if (existing) {
    await db
      .update(noteReviewStatsTable)
      .set({
        totalServed: Math.max(existing.totalServed ?? 1, 1),
        repetitionStage: nextStage,
        lastServedAt: now,
        nextEligibleAt,
        updatedAt: now,
      })
      .where(eq(noteReviewStatsTable.noteId, noteId));
  } else {
    await db.insert(noteReviewStatsTable).values({
      noteId,
      totalServed: 1,
      repetitionStage: nextStage,
      lastServedAt: now,
      nextEligibleAt,
      updatedAt: now,
    });
  }

  res.json({
    ok: true,
    feedback,
    repetitionStage: nextStage,
    nextEligibleAt: nextEligibleAt.toISOString(),
  });
});

router.post("/notes", async (req, res) => {
  const lesson = parseOptionalString(req.body.lesson)?.trim();
  if (!lesson) {
    res.status(400).json({ error: "Ders seçimi zorunludur" });
    return;
  }

  const title = parseOptionalString(req.body.title)?.trim() || "Yeni Not";
  const category = parseNoteCategory(req.body.category);
  const noteType = parseNoteType(req.body.noteType);

  const inserted = (await db
    .insert(notesTable)
    .values({
      id: parseOptionalString(req.body.id) || createNoteId(),
      category,
      lesson,
      title,
      topic: parseNullableString(req.body.topic) ?? null,
      noteType,
      description: parseNullableString(req.body.description) ?? "",
      drawingData: noteType === "drawing" ? parseNullableString(req.body.drawingData) ?? "" : null,
      pinned: parseBoolean(req.body.pinned, false),
    })
    .returning()) as any[];

  res.status(201).json(serializeNote(inserted[0]));
});

router.patch("/notes/:id", async (req, res) => {
  const existingRows = (await db.select().from(notesTable).where(eq(notesTable.id, req.params.id))) as any[];
  const existing = existingRows[0];

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const nextNoteType = parseNoteType(req.body.noteType, existing.noteType);
  const updatedRows = (await db
    .update(notesTable)
    .set({
      category: parseNoteCategory(req.body.category, existing.category),
      lesson: parseOptionalString(req.body.lesson)?.trim() || existing.lesson,
      title: parseOptionalString(req.body.title)?.trim() || existing.title,
      topic: req.body.topic === undefined ? existing.topic : parseNullableString(req.body.topic) ?? null,
      noteType: nextNoteType,
      description: req.body.description === undefined ? existing.description : parseNullableString(req.body.description) ?? "",
      drawingData: req.body.drawingData === undefined ? existing.drawingData : nextNoteType === "drawing" ? parseNullableString(req.body.drawingData) ?? "" : null,
      pinned: parseBoolean(req.body.pinned, existing.pinned),
      updatedAt: new Date(),
    })
    .where(eq(notesTable.id, req.params.id))
    .returning()) as any[];

  res.json(serializeNote(updatedRows[0]));
});

router.delete("/notes/:id", async (req, res) => {
  await db.delete(noteReviewStatsTable).where(eq(noteReviewStatsTable.noteId, req.params.id));
  await db.delete(notesTable).where(eq(notesTable.id, req.params.id));
  res.status(204).send();
});

export default router;

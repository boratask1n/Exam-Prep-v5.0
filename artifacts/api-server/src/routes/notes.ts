import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import * as dbSchema from "@workspace/db";

const notesTable = (dbSchema as any).notesTable;
const router: IRouter = Router();

type NoteCategory = "TYT" | "AYT";
type NoteType = "text" | "drawing";

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

function serializeNote(note: any) {
  return {
    ...note,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

function createNoteId() {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

router.get("/notes", async (req, res) => {
  const category = parseNoteCategory(req.query.category, undefined);
  const lesson = parseOptionalString(req.query.lesson);
  const search = parseOptionalString(req.query.search);
  const rawLimit =
    typeof req.query.limit === "string"
      ? Number.parseInt(req.query.limit, 10)
      : Number.NaN;
  const rawOffset =
    typeof req.query.offset === "string"
      ? Number.parseInt(req.query.offset, 10)
      : Number.NaN;
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
  const existingRows = (await db
    .select()
    .from(notesTable)
    .where(eq(notesTable.id, req.params.id))) as any[];
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
      topic:
        req.body.topic === undefined ? existing.topic : parseNullableString(req.body.topic) ?? null,
      noteType: nextNoteType,
      description:
        req.body.description === undefined
          ? existing.description
          : parseNullableString(req.body.description) ?? "",
      drawingData:
        req.body.drawingData === undefined
          ? existing.drawingData
          : nextNoteType === "drawing"
            ? parseNullableString(req.body.drawingData) ?? ""
            : null,
      pinned: parseBoolean(req.body.pinned, existing.pinned),
      updatedAt: new Date(),
    })
    .where(eq(notesTable.id, req.params.id))
    .returning()) as any[];

  res.json(serializeNote(updatedRows[0]));
});

router.delete("/notes/:id", async (req, res) => {
  await db.delete(notesTable).where(eq(notesTable.id, req.params.id));
  res.status(204).send();
});

export default router;

import { Router, type IRouter, type Request } from "express";
import { db } from "@workspace/db";
import { questionsTable, drawingsTable } from "@workspace/db";
import { eq, and, ilike, sql, or } from "drizzle-orm";
import {
  CreateQuestionBody,
  UpdateQuestionBody,
  ListQuestionsQueryParams,
  UploadQuestionImageBody,
  SaveDrawingBody,
} from "@workspace/api-zod";
import {
  getQuestionReviewFeed,
  markQuestionServed,
  submitQuestionReviewFeedback,
  type QuestionReviewFeedback,
} from "../services/questionReviewService";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { promises as fsp } from "fs";

const router: IRouter = Router();

const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const allowedImageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const maxUploadBytes = Number.parseInt(process.env.MAX_UPLOAD_BYTES ?? "", 10) || 8 * 1024 * 1024;
const uploadFilenamePattern = /^img_[a-f0-9-]+\.(jpg|png|webp)$/i;

function resolveUploadPath(filename: string) {
  if (!uploadFilenamePattern.test(filename)) return null;
  const root = path.resolve(uploadsDir);
  const candidate = path.resolve(root, filename);
  return candidate.startsWith(`${root}${path.sep}`) ? candidate : null;
}

function decodeBase64Image(rawImageData: string) {
  const base64Data = rawImageData.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  if (!/^[a-zA-Z0-9+/=\r\n]+$/.test(base64Data)) {
    throw new Error("invalid_base64");
  }
  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length === 0) throw new Error("empty_image");
  if (buffer.length > maxUploadBytes) throw new Error("image_too_large");
  return buffer;
}

function isLikelyImage(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (mimeType === "image/webp") {
    return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

function canRunAdminCleanup(req: Request) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (adminToken) return req.header("x-admin-token") === adminToken;
  return process.env.NODE_ENV !== "production";
}

/** Uploads dizininden g?venli dosya silme yard?mc?s?. */
function deleteUploadFile(imageUrl: string | null | undefined): void {
  if (!imageUrl) return;
  try {
    const filename = path.basename(imageUrl);
    const filepath = resolveUploadPath(filename);
    if (filepath && fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  } catch {
    // Silme hatas? kritik de?il, devam et.
  }
}

function serializeQuestion(q: typeof questionsTable.$inferSelect) {
  return {
    ...q,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  };
}

function normalizeOptions(
  raw: Array<{ label: string; text: string }> | null | undefined,
) {
  if (!raw || raw.length === 0) return null;
  const normalized = raw
    .map((option) => ({
      label: (option.label ?? "").trim().toUpperCase(),
      text: (option.text ?? "").trim(),
    }))
    .filter((option) => option.label.length > 0 && option.text.length > 0)
    .slice(0, 5);
  return normalized.length > 0 ? normalized : null;
}

function normalizeYoutubeStartSecond(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

router.get("/questions", async (req, res) => {
  const query = ListQuestionsQueryParams.parse(req.query);
  const conditions = [];

  if (query.category) conditions.push(eq(questionsTable.category, query.category));
  if (query.source) conditions.push(eq(questionsTable.source, query.source));
  if (query.lesson) conditions.push(ilike(questionsTable.lesson, `%${query.lesson}%`));
  if (query.publisher) conditions.push(ilike(questionsTable.publisher!, `%${query.publisher}%`));
  if (query.status) conditions.push(eq(questionsTable.status, query.status));
  if (query.topic) conditions.push(ilike(questionsTable.topic!, `%${query.topic}%`));
  if (query.isOsymBadge !== undefined) conditions.push(eq(questionsTable.isOsymBadge, query.isOsymBadge));
  if (query.isPremiumBadge !== undefined) conditions.push(eq(questionsTable.isPremiumBadge, query.isPremiumBadge));
  if (query.search) {
    const searchTerm = `%${query.search.trim()}%`;
    conditions.push(
      or(
        sql`coalesce(${questionsTable.lesson}, '') ilike ${searchTerm}`,
        sql`coalesce(${questionsTable.topic}, '') ilike ${searchTerm}`,
        sql`coalesce(${questionsTable.publisher}, '') ilike ${searchTerm}`,
        sql`coalesce(${questionsTable.testName}, '') ilike ${searchTerm}`,
        sql`coalesce(${questionsTable.testNo}, '') ilike ${searchTerm}`,
        sql`coalesce(${questionsTable.description}, '') ilike ${searchTerm}`,
      )!,
    );
  }

  // Pagination
  const rawLimit =
    typeof req.query.limit === "string"
      ? Number.parseInt(req.query.limit, 10)
      : Number.NaN;
  const rawOffset =
    typeof req.query.offset === "string"
      ? Number.parseInt(req.query.offset, 10)
      : Number.NaN;
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 20;
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;

  // Total count query
  const countResult = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(questionsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  const total = countResult[0]?.count || 0;

  // Data query with pagination
  const questions = await db
    .select()
    .from(questionsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(questionsTable.createdAt)
    .limit(limit)
    .offset(offset);

  res.json({
    items: questions.map(serializeQuestion),
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + questions.length < total
    }
  });
});

router.post("/questions/image", async (req, res) => {
  try {
    const body = UploadQuestionImageBody.parse(req.body);
    const mimeType = body.mimeType.toLowerCase();
    const ext = allowedImageTypes.get(mimeType);
    if (!ext) {
      return res.status(400).json({ error: "Sadece JPEG, PNG veya WEBP görsel yüklenebilir." });
    }

    const imageBuffer = decodeBase64Image(body.imageData);
    if (!isLikelyImage(imageBuffer, mimeType)) {
      return res.status(400).json({ error: "Görsel içeriği seçilen dosya türüyle eşleşmiyor." });
    }

    const filename = `img_${randomUUID()}.${ext}`;
    const filepath = resolveUploadPath(filename);
    if (!filepath) {
      return res.status(400).json({ error: "Geçersiz dosya adı." });
    }

    await fsp.writeFile(filepath, imageBuffer, { flag: "wx" });
    return res.json({ url: `/api/uploads/${filename}` });
  } catch (error) {
    const message = (error as Error).message;
    if (message === "image_too_large") {
      return res.status(413).json({ error: `Görsel boyutu en fazla ${Math.floor(maxUploadBytes / 1024 / 1024)} MB olabilir.` });
    }
    if (message === "invalid_base64" || message === "empty_image") {
      return res.status(400).json({ error: "Geçersiz görsel verisi." });
    }
    throw error;
  }
});

router.get("/uploads/:filename", (req, res) => {
  const filepath = resolveUploadPath(req.params.filename);
  if (!filepath) {
    res.status(400).json({ error: "Geçersiz dosya adı" });
    return;
  }
  if (!fs.existsSync(filepath)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.sendFile(filepath);
});

router.post("/questions", async (req, res) => {
  const body = CreateQuestionBody.parse(req.body) as any;
  const [question] = await db
    .insert(questionsTable)
    .values({
      imageUrl: body.imageUrl ?? null,
      description: body.description ?? null,
      lesson: body.lesson,
      topic: body.topic ?? null,
      publisher: body.publisher ?? null,
      testName: body.testName ?? null,
      testNo: body.testNo ?? null,
      options: normalizeOptions(body.options ?? null),
      choice: body.choice ?? null,
      solutionUrl: body.solutionUrl ?? null,
      solutionYoutubeUrl: body.solutionYoutubeUrl ?? null,
      solutionYoutubeStartSecond: normalizeYoutubeStartSecond(body.solutionYoutubeStartSecond),
      category: body.category ?? "TYT",
      source: body.source ?? "Banka",
      status: body.status ?? "Cozulmedi",
      hasDrawing: false,
      isOsymBadge: Boolean(body.isOsymBadge),
      isPremiumBadge: Boolean(body.isPremiumBadge),
    } as any)
    .returning();

  res.status(201).json(serializeQuestion(question));
});

router.get("/questions/review/feed", async (req, res) => {
  const rawLimit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : Number.NaN;
  const feed = await getQuestionReviewFeed({
    limit: Number.isFinite(rawLimit) ? rawLimit : undefined,
    search: typeof req.query.search === "string" ? req.query.search : undefined,
    excludeIdsRaw: req.query.excludeIds,
  });
  res.json(feed);
});

router.post("/questions/review/serve/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Geçersiz soru ID" });
    return;
  }

  const result = await markQuestionServed(id);
  if (!result) {
    res.status(404).json({ error: "Soru bulunamadı" });
    return;
  }

  res.json(result);
});

router.post("/questions/review/feedback/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Geçersiz soru ID" });
    return;
  }

  const feedback = typeof req.body?.feedback === "string" ? req.body.feedback : "";
  const allowedFeedback = ["again", "wrong", "hard", "correct", "easy", "less_often", "more_often"];
  if (!allowedFeedback.includes(feedback)) {
    res.status(400).json({ error: "Geçersiz geri bildirim" });
    return;
  }

  const result = await submitQuestionReviewFeedback(id, feedback as QuestionReviewFeedback);
  if (!result) {
    res.status(404).json({ error: "Soru bulunamadı" });
    return;
  }

  res.json(result);
});

router.get("/questions/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [question] = await db.select().from(questionsTable).where(eq(questionsTable.id, id));
  if (!question) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeQuestion(question));
});

router.patch("/questions/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const body = UpdateQuestionBody.parse(req.body) as any;

  // Mevcut soruyu getir - eski resmi silmek için
  const [existing] = await db.select().from(questionsTable).where(eq(questionsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.imageUrl !== undefined) updateData.imageUrl = body.imageUrl;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.lesson !== undefined) updateData.lesson = body.lesson;
  if (body.topic !== undefined) updateData.topic = body.topic;
  if (body.publisher !== undefined) updateData.publisher = body.publisher;
  if (body.testName !== undefined) updateData.testName = body.testName;
  if (body.testNo !== undefined) updateData.testNo = body.testNo;
  if (body.options !== undefined) updateData.options = normalizeOptions(body.options);
  if (body.choice !== undefined) updateData.choice = body.choice;
  if (body.category !== undefined) updateData.category = body.category;
  if (body.source !== undefined) updateData.source = body.source;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.solutionUrl !== undefined) updateData.solutionUrl = body.solutionUrl;
  if (body.solutionYoutubeUrl !== undefined) updateData.solutionYoutubeUrl = body.solutionYoutubeUrl;
  if (body.solutionYoutubeStartSecond !== undefined) {
    updateData.solutionYoutubeStartSecond = normalizeYoutubeStartSecond(body.solutionYoutubeStartSecond);
  }
  if (body.isOsymBadge !== undefined) updateData.isOsymBadge = body.isOsymBadge;
  if (body.isPremiumBadge !== undefined) updateData.isPremiumBadge = body.isPremiumBadge;

  const [question] = await db
    .update(questionsTable)
    .set(updateData)
    .where(eq(questionsTable.id, id))
    .returning();

  // Resim değiştiyse eski dosyayı sil
  if (body.imageUrl !== undefined && body.imageUrl !== existing.imageUrl) {
    deleteUploadFile(existing.imageUrl);
  }

  res.json(serializeQuestion(question));
});

router.delete("/questions/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  // Önce soruyu getir ve resmi varsa sil
  const [existing] = await db.select().from(questionsTable).where(eq(questionsTable.id, id));
  if (existing) {
    deleteUploadFile(existing.imageUrl);
  }

  await db.delete(questionsTable).where(eq(questionsTable.id, id));
  res.status(204).send();
});

router.get("/questions/:id/drawing", async (req, res) => {
  const id = parseInt(req.params.id);
  const [drawing] = await db.select().from(drawingsTable).where(eq(drawingsTable.questionId, id));
  if (!drawing) {
    res.json({ id: 0, questionId: id, canvasData: "[]", updatedAt: new Date().toISOString() });
    return;
  }
  res.json({ ...drawing, updatedAt: drawing.updatedAt.toISOString() });
});

router.put("/questions/:id/drawing", async (req, res) => {
  const id = parseInt(req.params.id);
  const body = SaveDrawingBody.parse(req.body);

  const [existing] = await db.select().from(drawingsTable).where(eq(drawingsTable.questionId, id));

  let drawing;
  if (existing) {
    [drawing] = await db
      .update(drawingsTable)
      .set({ canvasData: body.canvasData, updatedAt: new Date() })
      .where(eq(drawingsTable.questionId, id))
      .returning();
  } else {
    [drawing] = await db
      .insert(drawingsTable)
      .values({ questionId: id, canvasData: body.canvasData })
      .returning();
  }

  let hasDrawing = false;
  try {
    const parsed = JSON.parse(body.canvasData);
    if (Array.isArray(parsed)) {
      hasDrawing = parsed.length > 0;
    } else if (parsed && typeof parsed === "object") {
      hasDrawing =
        (Array.isArray(parsed.overlay) && parsed.overlay.length > 0) ||
        (Array.isArray(parsed.board) && parsed.board.length > 0);
    }
  } catch { hasDrawing = false; }

  await db.update(questionsTable).set({ hasDrawing, updatedAt: new Date() }).where(eq(questionsTable.id, id));
  res.json({ ...drawing, updatedAt: drawing.updatedAt.toISOString() });
});

router.get("/filters/options", async (req, res) => {
  const lessonsResult = await db
    .selectDistinct({ lesson: questionsTable.lesson })
    .from(questionsTable)
    .orderBy(questionsTable.lesson);

  const topicsResult = await db
    .selectDistinct({ topic: questionsTable.topic })
    .from(questionsTable)
    .where(sql`${questionsTable.topic} IS NOT NULL`)
    .orderBy(questionsTable.topic);

  const publishersResult = await db
    .selectDistinct({ publisher: questionsTable.publisher })
    .from(questionsTable)
    .where(sql`${questionsTable.publisher} IS NOT NULL`)
    .orderBy(questionsTable.publisher);

  res.json({
    lessons: lessonsResult.map((r) => r.lesson),
    topics: topicsResult.map((r) => r.topic).filter(Boolean),
    publishers: publishersResult.map((r) => r.publisher).filter(Boolean),
  });
});

/** Kullan?lmayan (orphan) upload dosyalar?n? temizle */
router.post("/admin/cleanup-uploads", async (req, res) => {
  if (!canRunAdminCleanup(req)) {
    return res.status(401).json({ error: "Yetkisiz admin i?lemi" });
  }

  const questions = await db.select({ imageUrl: questionsTable.imageUrl }).from(questionsTable);
  const referencedFiles = new Set(
    questions
      .map((q) => q.imageUrl)
      .filter((url): url is string => !!url)
      .map((url) => path.basename(url))
  );

  const files = await fsp.readdir(uploadsDir);
  const deleted: string[] = [];
  const kept: string[] = [];

  for (const file of files) {
    // Sadece uygulaman?n ?retti?i g?venli dosya adlar?n? temizle.
    const filepath = resolveUploadPath(file);
    if (!filepath) {
      kept.push(file);
      continue;
    }
    if (!referencedFiles.has(file)) {
      try {
        await fsp.unlink(filepath);
        deleted.push(file);
      } catch {
        kept.push(file);
      }
    } else {
      kept.push(file);
    }
  }

  return res.json({ deleted, kept, deletedCount: deleted.length, keptCount: kept.length });
});

export default router;


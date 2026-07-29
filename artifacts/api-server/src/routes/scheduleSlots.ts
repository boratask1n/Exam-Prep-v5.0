import { Router, Request, Response, RequestHandler } from "express";
import { db, studySlotsTable, insertStudySlotSchema } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getAuthUserId } from "../middlewares/auth";

const router = Router();

// GET /api/schedule-slots — Kullanıcının tüm slotlarını getir
router.get("/", (async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const slots = await db
      .select()
      .from(studySlotsTable)
      .where(eq(studySlotsTable.userId, userId));

    const mapped = slots.map((s) => ({
      id: s.slotKey,
      day: s.day,
      startTime: s.startTime,
      endTime: s.endTime,
      category: s.category || undefined,
      lesson: s.lesson,
      topic: s.topic || undefined,
      activityType: s.activityType,
      resourceId: s.resourceId || undefined,
      resourceName: s.resourceName || undefined,
      examNo: s.examNo || undefined,
      targetQuestions: s.targetQuestions || undefined,
      notes: s.notes || undefined,
      color: s.color,
      completed: s.completed,
      practiceExamId: s.practiceExamId || undefined,
    }));

    res.json(mapped);
  } catch (error) {
    console.error("List schedule slots error:", error);
    res.status(500).json({ error: "Failed to list schedule slots" });
  }
}) as RequestHandler);

function parseOptionalInt(val: any): number | null {
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  return isNaN(num) ? null : Math.round(num);
}

// PUT /api/schedule-slots — Tüm slotları toplu güncelle (replace all)
router.put("/", (async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const slots = Array.isArray(req.body) ? req.body : [];

    // Yenilerini parse et — Hata çıkarsa silme işlemi yapılmamış olur (veri kaybını engeller)
    const toInsert = slots.map((slot, index) => {
      const slotKey = String(slot.id || `slot_${Date.now()}_${index}`);
      return insertStudySlotSchema.parse({
        userId,
        slotKey,
        day: String(slot.day || "Pazartesi"),
        startTime: String(slot.startTime || "09:00"),
        endTime: String(slot.endTime || "10:00"),
        category: slot.category ? String(slot.category) : null,
        lesson: String(slot.lesson || "Ders"),
        topic: slot.topic ? String(slot.topic) : null,
        activityType: String(slot.activityType || "Konu Çalışması"),
        resourceId: parseOptionalInt(slot.resourceId),
        resourceName: slot.resourceName ? String(slot.resourceName) : null,
        targetQuestions: parseOptionalInt(slot.targetQuestions),
        examNo: parseOptionalInt(slot.examNo),
        notes: slot.notes ? String(slot.notes) : null,
        color: String(slot.color || "indigo"),
        completed: Boolean(slot.completed),
        practiceExamId: parseOptionalInt(slot.practiceExamId),
      });
    });

    const inserted = await db.transaction(async (tx) => {
      // Kullanıcının mevcut tüm slotlarını sil
      await tx.delete(studySlotsTable).where(eq(studySlotsTable.userId, userId));

      if (toInsert.length === 0) {
        return [];
      }

      return tx.insert(studySlotsTable).values(toInsert).returning();
    });

    const mapped = inserted.map((s) => ({
      id: s.slotKey,
      day: s.day,
      startTime: s.startTime,
      endTime: s.endTime,
      category: s.category || undefined,
      lesson: s.lesson,
      topic: s.topic || undefined,
      activityType: s.activityType,
      resourceId: s.resourceId || undefined,
      resourceName: s.resourceName || undefined,
      examNo: s.examNo || undefined,
      targetQuestions: s.targetQuestions || undefined,
      notes: s.notes || undefined,
      color: s.color,
      completed: s.completed,
      practiceExamId: s.practiceExamId || undefined,
    }));

    res.json(mapped);
  } catch (error: any) {
    console.error("Save schedule slots error:", error);
    res.status(400).json({ error: error.message || "Failed to save schedule slots" });
  }
}) as RequestHandler);

export default router;

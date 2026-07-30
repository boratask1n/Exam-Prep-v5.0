import { pgTable, serial, text, integer, boolean, timestamp, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const studySlotsTable = pgTable(
  "study_slots",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    /** Slot'un frontend'deki benzersiz ID'si (slot_XXXX formatında) */
    slotKey: text("slot_key").notNull(),
    day: text("day").notNull(), // "Pazartesi" ... "Pazar"
    startTime: text("start_time").notNull(), // "09:00"
    endTime: text("end_time").notNull(),
    category: text("category"), // "TYT" | "AYT" | "Genel"
    lesson: text("lesson").notNull(),
    topic: text("topic"),
    activityType: text("activity_type").notNull(),
    resourceId: integer("resource_id"),
    resourceName: text("resource_name"),
    targetQuestions: integer("target_questions"),
    examNo: integer("exam_no"),
    notes: text("notes"),
    color: text("color").notNull().default("indigo"),
    completed: boolean("completed").notNull().default(false),
    practiceExamId: integer("practice_exam_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("study_slots_user_id_idx").on(table.userId),
    slotKeyIdx: index("study_slots_slot_key_idx").on(table.userId, table.slotKey),
    dayIdx: index("study_slots_day_idx").on(table.userId, table.day),
  })
);

export const insertStudySlotSchema = createInsertSchema(studySlotsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertStudySlot = z.infer<typeof insertStudySlotSchema>;
export type StudySlotRecord = typeof studySlotsTable.$inferSelect;

export const studyScheduleCompletionsTable = pgTable(
  "study_schedule_completions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    slotKey: text("slot_key").notNull(),
    category: text("category"), // "TYT" | "AYT" | "Genel" vb.
    lesson: text("lesson").notNull(),
    topic: text("topic"),
    activityType: text("activity_type").notNull(), // "Soru Çözümü", "Konu Denemesi", "Branş Denemesi", "Genel Deneme"
    questionCount: integer("question_count").notNull().default(0), // Çözülen / Hedeflenen soru sayısı
    completedAt: timestamp("completed_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("study_schedule_completions_user_id_idx").on(table.userId),
    slotKeyUq: uniqueIndex("study_schedule_completions_user_slot_uq").on(table.userId, table.slotKey),
  })
);

export type StudyScheduleCompletionRecord = typeof studyScheduleCompletionsTable.$inferSelect;

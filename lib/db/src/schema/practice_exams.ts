import { pgTable, serial, text, integer, timestamp, index, jsonb, real } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { resourcesTable } from "./resources";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const practiceExamsTable = pgTable(
  "practice_exams",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    examType: text("exam_type").notNull().default("Genel"), // "Genel" veya "Konu"
    category: text("category").notNull().default("TYT"), // "TYT" veya "AYT"
    resourceId: integer("resource_id").references(() => resourcesTable.id, { onDelete: "set null" }),
    lesson: text("lesson"),
    topic: text("topic"),
    publisher: text("publisher"),
    examDate: timestamp("exam_date").notNull().defaultNow(),
    examNo: integer("exam_no"),
    targetQuestionCount: integer("target_question_count"),
    durationMinutes: integer("duration_minutes"),
    totalNet: real("total_net").notNull().default(0),
    details: jsonb("details").$type<Record<string, { correct: number; wrong: number; net: number }>>(),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("practice_exams_user_id_idx").on(table.userId),
    categoryIdx: index("practice_exams_category_idx").on(table.category),
    examDateIdx: index("practice_exams_exam_date_idx").on(table.examDate),
  })
);

export const insertPracticeExamSchema = createInsertSchema(practiceExamsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPracticeExam = z.infer<typeof insertPracticeExamSchema>;
export type PracticeExam = typeof practiceExamsTable.$inferSelect;

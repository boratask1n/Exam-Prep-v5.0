import { pgTable, serial, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const questionActivityLogsTable = pgTable("question_activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  lesson: varchar("lesson", { length: 255 }).notNull(),
  questionCount: integer("question_count").notNull().default(0),
  activityType: varchar("activity_type", { length: 50 }).notNull().default("Schedule"), // 'Schedule' or 'PracticeExam' etc.
  date: timestamp("date").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertQuestionActivityLogSchema = createInsertSchema(questionActivityLogsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertQuestionActivityLog = z.infer<typeof insertQuestionActivityLogSchema>;
export type QuestionActivityLog = typeof questionActivityLogsTable.$inferSelect;

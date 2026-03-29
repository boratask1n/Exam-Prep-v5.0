import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { questionsTable } from "./questions";

export const testSessionsTable = pgTable("test_sessions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  timeLimitSeconds: integer("time_limit_seconds"),
  /** Test tamamlandığında set edilir; gözden geçirme modu için */
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const testSessionQuestionsTable = pgTable("test_session_questions", {
  id: serial("id").primaryKey(),
  testSessionId: integer("test_session_id").notNull().references(() => testSessionsTable.id, { onDelete: "cascade" }),
  questionId: integer("question_id").notNull().references(() => questionsTable.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull().default(0),
});

export const insertTestSessionSchema = createInsertSchema(testSessionsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertTestSession = z.infer<typeof insertTestSessionSchema>;
export type TestSession = typeof testSessionsTable.$inferSelect;
export type TestSessionQuestion = typeof testSessionQuestionsTable.$inferSelect;

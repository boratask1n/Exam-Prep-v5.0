import { pgTable, serial, text, integer, timestamp, boolean, json, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { questionsTable } from "./questions";
import { usersTable } from "./auth";

export const testSessionsTable = pgTable("test_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  timeLimitSeconds: integer("time_limit_seconds"),
  /** Test tamamlandığında set edilir; gözden geçirme modu için */
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index("test_sessions_user_id_idx").on(table.userId),
}));

export const testSessionQuestionsTable = pgTable("test_session_questions", {
  id: serial("id").primaryKey(),
  testSessionId: integer("test_session_id").notNull().references(() => testSessionsTable.id, { onDelete: "cascade" }),
  questionId: integer("question_id").notNull().references(() => questionsTable.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull().default(0),
}, (table) => ({
  testSessionIdIdx: index("test_session_questions_session_id_idx").on(table.testSessionId),
  questionIdIdx: index("test_session_questions_question_id_idx").on(table.questionId),
}));

export const testSolutionsTable = pgTable("test_solutions", {
  id: serial("id").primaryKey(),
  testSessionId: integer("test_session_id").notNull().references(() => testSessionsTable.id, { onDelete: "cascade" }),
  questionId: integer("question_id").notNull().references(() => questionsTable.id, { onDelete: "cascade" }),
  userAnswer: text("user_answer"),
  status: text("status").notNull().default("Cozulmedi"), // Cozulmedi | DogruCozuldu | YanlisHocayaSor
  isCompleted: boolean("is_completed").notNull().default(false),
  canvasData: text("canvas_data"), // Overlay drawing data (JSON string)
  inlineDrawings: json("inline_drawings"), // Inline drawing strokes (JSON)
  tempDrawing: text("temp_drawing"), // Temporary canvas data
  currentIndex: integer("current_index"), // Current question index in test
  timer: integer("timer"), // Timer value in seconds
  elapsed: integer("elapsed"), // Elapsed time in seconds
  inlineDrawEnabled: boolean("inline_draw_enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  testSessionIdIdx: index("test_solutions_session_id_idx").on(table.testSessionId),
  questionIdIdx: index("test_solutions_question_id_idx").on(table.questionId),
}));

export const testSessionProgressTable = pgTable("test_session_progress", {
  id: serial("id").primaryKey(),
  testSessionId: integer("test_session_id").notNull().references(() => testSessionsTable.id, { onDelete: "cascade" }),
  currentIndex: integer("current_index").notNull().default(0),
  timer: integer("timer"), // Remaining timer in seconds
  elapsed: integer("elapsed").notNull().default(0), // Elapsed time in seconds
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  inlineDrawEnabled: boolean("inline_draw_enabled").notNull().default(false),
  collapsedLessons: json("collapsed_lessons"), // Record<string, boolean>
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  testSessionIdIdx: index("test_session_progress_session_id_idx").on(table.testSessionId),
}));

export const insertTestSessionSchema = createInsertSchema(testSessionsTable).omit({
  id: true,
  createdAt: true,
});

export const insertTestSolutionSchema = createInsertSchema(testSolutionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTestSessionProgressSchema = createInsertSchema(testSessionProgressTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTestSession = z.infer<typeof insertTestSessionSchema>;
export type TestSession = typeof testSessionsTable.$inferSelect;
export type TestSessionQuestion = typeof testSessionQuestionsTable.$inferSelect;
export type InsertTestSolution = z.infer<typeof insertTestSolutionSchema>;
export type TestSolution = typeof testSolutionsTable.$inferSelect;
export type InsertTestSessionProgress = z.infer<typeof insertTestSessionProgressSchema>;
export type TestSessionProgress = typeof testSessionProgressTable.$inferSelect;

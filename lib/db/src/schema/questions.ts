import { pgTable, serial, text, timestamp, boolean, jsonb, index, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const questionsTable = pgTable("questions", {
  id: serial("id").primaryKey(),
  imageUrl: text("image_url"),
  description: text("description"),
  lesson: text("lesson").notNull(),
  topic: text("topic"),
  publisher: text("publisher"),
  testName: text("test_name"),
  testNo: text("test_no"),
  options: jsonb("options").$type<Array<{ label: string; text: string }>>(),
  choice: text("choice"),
  solutionUrl: text("solution_url"),
  solutionYoutubeUrl: text("solution_youtube_url"),
  solutionYoutubeStartSecond: integer("solution_youtube_start_second"),
  category: text("category").notNull().default("TYT"),
  source: text("source").notNull().default("Banka"),
  status: text("status").notNull().default("Cozulmedi"),
  hasDrawing: boolean("has_drawing").notNull().default(false),
  isOsymBadge: boolean("is_osym_badge").notNull().default(false),
  isPremiumBadge: boolean("is_premium_badge").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  categoryIdx: index("questions_category_idx").on(table.category),
  lessonIdx: index("questions_lesson_idx").on(table.lesson),
  topicIdx: index("questions_topic_idx").on(table.topic),
  sourceIdx: index("questions_source_idx").on(table.source),
  statusIdx: index("questions_status_idx").on(table.status),
  createdAtIdx: index("questions_created_at_idx").on(table.createdAt),
  updatedAtIdx: index("questions_updated_at_idx").on(table.updatedAt),
  badgeFlagsIdx: index("questions_badge_flags_idx").on(table.isOsymBadge, table.isPremiumBadge),
}));

export const questionReviewStatsTable = pgTable("question_review_stats", {
  questionId: integer("question_id")
    .primaryKey()
    .references(() => questionsTable.id, { onDelete: "cascade" }),
  totalServed: integer("total_served").notNull().default(0),
  totalReviewed: integer("total_reviewed").notNull().default(0),
  correctReviewCount: integer("correct_review_count").notNull().default(0),
  wrongReviewCount: integer("wrong_review_count").notNull().default(0),
  repetitionStage: integer("repetition_stage").notNull().default(0),
  lastServedAt: timestamp("last_served_at"),
  lastReviewedAt: timestamp("last_reviewed_at"),
  nextEligibleAt: timestamp("next_eligible_at"),
  lastOutcome: text("last_outcome"),
  lastTestSessionId: integer("last_test_session_id"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  nextEligibleIdx: index("question_review_stats_next_eligible_idx").on(table.nextEligibleAt),
  updatedAtIdx: index("question_review_stats_updated_at_idx").on(table.updatedAt),
  lastOutcomeIdx: index("question_review_stats_last_outcome_idx").on(table.lastOutcome),
}));

export const insertQuestionSchema = createInsertSchema(questionsTable).omit({
  id: true,
  hasDrawing: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Question = typeof questionsTable.$inferSelect;
export type QuestionReviewStats = typeof questionReviewStatsTable.$inferSelect;

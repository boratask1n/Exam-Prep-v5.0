import { pgTable, serial, text, integer, timestamp, uniqueIndex, index, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const testResultSummariesTable = pgTable(
  "test_result_summaries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
    /** Intentionally no FK to keep analytics history after test deletion */
    testSessionId: integer("test_session_id").notNull(),
    testName: text("test_name").notNull(),
    totalQuestions: integer("total_questions").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    wrongCount: integer("wrong_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    elapsedSeconds: integer("elapsed_seconds").notNull().default(0),
    completedAt: timestamp("completed_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uqTestSessionId: uniqueIndex("test_result_summaries_test_session_id_uq").on(table.testSessionId),
    ixUserId: index("test_result_summaries_user_id_idx").on(table.userId),
    ixCompletedAt: index("test_result_summaries_completed_at_idx").on(table.completedAt),
  }),
);

export const testResultTopicStatsTable = pgTable(
  "test_result_topic_stats",
  {
    id: serial("id").primaryKey(),
    testResultId: integer("test_result_id")
      .notNull()
      .references(() => testResultSummariesTable.id, { onDelete: "cascade" }),
    lesson: text("lesson").notNull(),
    topic: text("topic").notNull(),
    totalQuestions: integer("total_questions").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    wrongCount: integer("wrong_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    answeredCount: integer("answered_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    ixResultId: index("test_result_topic_stats_result_id_idx").on(table.testResultId),
    ixLessonTopic: index("test_result_topic_stats_lesson_topic_idx").on(table.lesson, table.topic),
  }),
);

export const analyticsAiInsightsTable = pgTable(
  "analytics_ai_insights",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    insights: jsonb("insights").$type<unknown>().notNull(),
    requestedAt: timestamp("requested_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uqUserId: uniqueIndex("analytics_ai_insights_user_id_uq").on(table.userId),
    ixRequestedAt: index("analytics_ai_insights_requested_at_idx").on(table.requestedAt),
  }),
);

export type TestResultSummary = typeof testResultSummariesTable.$inferSelect;
export type TestResultTopicStat = typeof testResultTopicStatsTable.$inferSelect;
export type AnalyticsAiInsight = typeof analyticsAiInsightsTable.$inferSelect;

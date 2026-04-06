import { pgTable, serial, text, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
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

export const insertQuestionSchema = createInsertSchema(questionsTable).omit({
  id: true,
  hasDrawing: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Question = typeof questionsTable.$inferSelect;

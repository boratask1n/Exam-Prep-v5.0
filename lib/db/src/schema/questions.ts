import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
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
  choice: text("choice"),
  /** YouTube veya başka çözüm videosu URL’si */
  solutionUrl: text("solution_url"),
  category: text("category").notNull().default("TYT"),
  source: text("source").notNull().default("Banka"),
  status: text("status").notNull().default("Cozulmedi"),
  hasDrawing: boolean("has_drawing").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertQuestionSchema = createInsertSchema(questionsTable).omit({
  id: true,
  hasDrawing: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Question = typeof questionsTable.$inferSelect;

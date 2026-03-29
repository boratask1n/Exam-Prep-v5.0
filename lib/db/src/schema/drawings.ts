import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { questionsTable } from "./questions";

export const drawingsTable = pgTable("drawings", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull().references(() => questionsTable.id, { onDelete: "cascade" }),
  canvasData: text("canvas_data").notNull().default("[]"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDrawingSchema = createInsertSchema(drawingsTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertDrawing = z.infer<typeof insertDrawingSchema>;
export type Drawing = typeof drawingsTable.$inferSelect;

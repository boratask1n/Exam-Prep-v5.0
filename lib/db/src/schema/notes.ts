import { boolean, pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const notesTable = pgTable("notes", {
  id: text("id").primaryKey(),
  category: text("category").notNull().default("TYT"),
  lesson: text("lesson").notNull(),
  title: text("title").notNull().default("Yeni Not"),
  topic: text("topic"),
  noteType: text("note_type").notNull().default("text"),
  description: text("description"),
  drawingData: text("drawing_data"),
  pinned: boolean("pinned").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  categoryIdx: index("notes_category_idx").on(table.category),
  lessonIdx: index("notes_lesson_idx").on(table.lesson),
  updatedAtIdx: index("notes_updated_at_idx").on(table.updatedAt),
  pinnedUpdatedAtIdx: index("notes_pinned_updated_at_idx").on(table.pinned, table.updatedAt),
}));

export const insertNoteSchema = createInsertSchema(notesTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Note = typeof notesTable.$inferSelect;

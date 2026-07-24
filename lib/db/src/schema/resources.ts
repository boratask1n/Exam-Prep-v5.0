import {
  pgTable,
  serial,
  text,
  timestamp,
  index,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const resourcesTable = pgTable(
  "resources",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => usersTable.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    publisher: text("publisher"),
    category: text("category").notNull().default("TYT"),
    lesson: text("lesson"),
    topic: text("topic"),
    resourceType: text("resource_type").notNull().default("Soru Bankası"),
    targetQuestionCount: integer("target_question_count").default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("resources_user_id_idx").on(table.userId),
    categoryIdx: index("resources_category_idx").on(table.category),
    lessonIdx: index("resources_lesson_idx").on(table.lesson),
    resourceTypeIdx: index("resources_resource_type_idx").on(table.resourceType),
    updatedAtIdx: index("resources_updated_at_idx").on(table.updatedAt),
  }),
);

export const insertResourceSchema = createInsertSchema(resourcesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertResource = z.infer<typeof insertResourceSchema>;
export type Resource = typeof resourcesTable.$inferSelect;

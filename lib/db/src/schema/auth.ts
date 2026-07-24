import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at"),
  },
  (table) => ({
    emailUnique: uniqueIndex("users_email_uq").on(table.email),
  }),
);

export const authSessionsTable = pgTable(
  "auth_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("auth_sessions_token_hash_uq").on(table.tokenHash),
    userIdIdx: index("auth_sessions_user_id_idx").on(table.userId),
    expiresAtIdx: index("auth_sessions_expires_at_idx").on(table.expiresAt),
  }),
);

export type User = typeof usersTable.$inferSelect;
export type AuthSessionRow = typeof authSessionsTable.$inferSelect;

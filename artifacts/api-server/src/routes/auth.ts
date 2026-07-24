import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { Router } from "express";
import { eq, isNull, sql } from "drizzle-orm";
import {
  authSessionsTable,
  db,
  notesTable,
  questionsTable,
  testResultSummariesTable,
  testSessionsTable,
  usersTable,
} from "@workspace/db";
import {
  findUserByBearerToken,
  getBearerToken,
  getTokenHash,
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/auth";

const router = Router();
const scrypt = promisify(scryptCallback);
const PASSWORD_KEY_LENGTH = 64;
const SESSION_BYTES = 32;
const SESSION_DAYS_REMEMBERED = 45;
const SESSION_HOURS_TEMPORARY = 12;
const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
const uploadFilenamePattern = /^img_[a-f0-9-]+\.(jpg|png|webp)$/i;

function resolveUploadPath(filename: string) {
  if (!uploadFilenamePattern.test(filename)) return null;
  const root = path.resolve(uploadsDir);
  const candidate = path.resolve(root, filename);
  return candidate.startsWith(`${root}${path.sep}`) ? candidate : null;
}

function deleteUploadFile(imageUrl: string | null | undefined) {
  if (!imageUrl) return;
  const filepath = resolveUploadPath(path.basename(imageUrl));
  if (!filepath) return;
  try {
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  } catch {
    // Dosya temizliği kritik değil; hesap verisi veritabanından silinmiş olur.
  }
}

function normalizeEmail(email: unknown) {
  return String(email ?? "").trim().toLowerCase();
}

function normalizeName(name: unknown, email: string) {
  const raw = String(name ?? "").trim();
  if (raw.length >= 2) return raw.slice(0, 80);
  const fallback = email.split("@")[0] || "Kullanıcı";
  return fallback.charAt(0).toUpperCase() + fallback.slice(1);
}

function validatePassword(password: unknown) {
  const value = String(password ?? "");
  if (value.length < 6) return null;
  if (value.length > 256) return null;
  return value;
}

async function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const derived = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
  return {
    salt,
    hash: derived.toString("hex"),
  };
}

async function verifyPassword(password: string, salt: string, storedHash: string) {
  const { hash } = await hashPassword(password, salt);
  const left = Buffer.from(hash, "hex");
  const right = Buffer.from(storedHash, "hex");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function publicUser(user: { id: number; name: string; email: string; createdAt?: Date | string }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
  };
}

async function createSession(userId: number, remember: boolean) {
  const token = randomBytes(SESSION_BYTES).toString("base64url");
  const now = Date.now();
  const durationMs = remember
    ? SESSION_DAYS_REMEMBERED * 24 * 60 * 60 * 1000
    : SESSION_HOURS_TEMPORARY * 60 * 60 * 1000;
  const expiresAt = new Date(now + durationMs);

  await db.insert(authSessionsTable).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });

  return {
    token,
    expiresAt: expiresAt.toISOString(),
  };
}

async function claimLegacyDataIfFreshAccount(userId: number) {
  if (process.env.DISABLE_LEGACY_CLAIM === "1") return;

  const [userScope] = await db
    .select({
      count: sql<number>`count(*)`.mapWith(Number),
      firstUserId: sql<number>`min(${usersTable.id})`.mapWith(Number),
    })
    .from(usersTable);
  if ((userScope?.count ?? 0) > 1 && userScope?.firstUserId !== userId) return;

  const [ownedQuestions] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(questionsTable)
    .where(eq(questionsTable.userId, userId));
  const [ownedNotes] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(notesTable)
    .where(eq(notesTable.userId, userId));
  const [ownedTests] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(testSessionsTable)
    .where(eq(testSessionsTable.userId, userId));

  if ((ownedQuestions?.count ?? 0) + (ownedNotes?.count ?? 0) + (ownedTests?.count ?? 0) > 0) return;

  await db.transaction(async (tx) => {
    await tx.update(questionsTable).set({ userId }).where(isNull(questionsTable.userId));
    await tx.update(notesTable).set({ userId }).where(isNull(notesTable.userId));
    await tx.update(testSessionsTable).set({ userId }).where(isNull(testSessionsTable.userId));
    await tx.update(testResultSummariesTable).set({ userId }).where(isNull(testResultSummariesTable.userId));
  });
}

router.post("/auth/register", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = validatePassword(req.body.password);
    const remember = Boolean(req.body.remember);

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Geçerli bir e-posta girin." });
    }
    if (!password) {
      return res.status(400).json({ error: "Şifre en az 6 karakter olmalı." });
    }

    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing) {
      return res.status(409).json({ error: "Bu e-posta ile kayıtlı bir hesap var." });
    }

    const { salt, hash } = await hashPassword(password);
    const [created] = await db
      .insert(usersTable)
      .values({
        name: normalizeName(req.body.name, email),
        email,
        passwordHash: hash,
        passwordSalt: salt,
        lastLoginAt: new Date(),
      })
      .returning();

    const session = await createSession(created.id, remember);
    await claimLegacyDataIfFreshAccount(created.id);
    return res.status(201).json({ user: publicUser(created), ...session });
  } catch (error) {
    console.error("Error registering user:", error);
    return res.status(500).json({ error: "Hesap oluşturulamadı." });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = validatePassword(req.body.password);
    const remember = Boolean(req.body.remember);

    if (!email || !password) {
      return res.status(400).json({ error: "E-posta ve şifre zorunlu." });
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (!user || !(await verifyPassword(password, user.passwordSalt, user.passwordHash))) {
      return res.status(401).json({ error: "E-posta veya şifre hatalı." });
    }

    await db.update(usersTable).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(usersTable.id, user.id));
    const session = await createSession(user.id, remember);
    await claimLegacyDataIfFreshAccount(user.id);
    return res.json({ user: publicUser(user), ...session });
  } catch (error) {
    console.error("Error logging in:", error);
    return res.status(500).json({ error: "Giriş yapılamadı." });
  }
});

router.get("/auth/me", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "Oturum bulunamadı." });

    const row = await findUserByBearerToken(token);
    if (!row) return res.status(401).json({ error: "Oturum geçersiz veya süresi dolmuş." });

    await claimLegacyDataIfFreshAccount(row.id);
    return res.json({ user: publicUser(row), expiresAt: row.expiresAt.toISOString() });
  } catch (error) {
    console.error("Error reading current user:", error);
    return res.status(500).json({ error: "Oturum kontrol edilemedi." });
  }
});

router.post("/auth/logout", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (token) {
      await db.delete(authSessionsTable).where(eq(authSessionsTable.tokenHash, getTokenHash(token)));
    }
    return res.status(204).send();
  } catch (error) {
    console.error("Error logging out:", error);
    return res.status(500).json({ error: "Çıkış yapılamadı." });
  }
});

router.delete("/auth/account", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).authUser.id;
    const imageRows = await db
      .select({ imageUrl: questionsTable.imageUrl })
      .from(questionsTable)
      .where(eq(questionsTable.userId, userId));

    await db.transaction(async (tx) => {
      await tx.delete(testResultSummariesTable).where(eq(testResultSummariesTable.userId, userId));
      await tx.delete(testSessionsTable).where(eq(testSessionsTable.userId, userId));
      await tx.delete(notesTable).where(eq(notesTable.userId, userId));
      await tx.delete(questionsTable).where(eq(questionsTable.userId, userId));
      await tx.delete(authSessionsTable).where(eq(authSessionsTable.userId, userId));
      await tx.delete(usersTable).where(eq(usersTable.id, userId));
    });

    for (const row of imageRows) deleteUploadFile(row.imageUrl);

    return res.status(204).send();
  } catch (error) {
    console.error("Error deleting account:", error);
    return res.status(500).json({ error: "Hesap silinemedi." });
  }
});

export default router;

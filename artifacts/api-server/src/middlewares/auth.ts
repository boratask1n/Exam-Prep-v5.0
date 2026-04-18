import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { authSessionsTable, db, usersTable } from "@workspace/db";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
};

export type AuthenticatedRequest = Request & {
  authUser: AuthUser;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getBearerToken(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function findUserByBearerToken(token: string) {
  const [row] = await db
    .select({
      sessionId: authSessionsTable.id,
      expiresAt: authSessionsTable.expiresAt,
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      createdAt: usersTable.createdAt,
    })
    .from(authSessionsTable)
    .innerJoin(usersTable, eq(authSessionsTable.userId, usersTable.id))
    .where(and(eq(authSessionsTable.tokenHash, hashToken(token)), gt(authSessionsTable.expiresAt, new Date())))
    .limit(1);

  return row ?? null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "Oturum bulunamadı." });
    }

    const user = await findUserByBearerToken(token);
    if (!user) {
      return res.status(401).json({ error: "Oturum geçersiz veya süresi dolmuş." });
    }

    (req as AuthenticatedRequest).authUser = {
      id: user.id,
      name: user.name,
      email: user.email,
    };
    return next();
  } catch (error) {
    console.error("Authentication middleware failed:", error);
    return res.status(500).json({ error: "Oturum kontrol edilemedi." });
  }
}

export function getAuthUserId(req: Request) {
  return (req as AuthenticatedRequest).authUser.id;
}

export function getTokenHash(token: string) {
  return hashToken(token);
}

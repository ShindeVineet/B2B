import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "./prisma";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET must be configured");
  return secret;
}
const COOKIE_NAME = "leadmap_token";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  region?: string | null;
  store_id?: string | null;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      region: user.region || null,
      store_id: user.store_id || null,
    },
    getJwtSecret(),
    { expiresIn: "7d" }
  );
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthUser;
    return decoded;
  } catch {
    return null;
  }
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function getCurrentUser(req?: NextRequest): Promise<AuthUser | null> {
  let token: string | undefined;

  if (req) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else {
      token = req.cookies.get(COOKIE_NAME)?.value;
    }
  } else {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(COOKIE_NAME)?.value;
    } catch {
      return null;
    }
  }

  if (!token) return null;
  const session = verifyToken(token);
  if (!session?.id) return null;
  return prisma.user.findFirst({
    where: { id: session.id, active: true },
    select: { id: true, name: true, email: true, role: true, region: true, store_id: true },
  });
}

export async function getFullCurrentUser() {
  const user = await getCurrentUser();
  if (!user) return null;
  return prisma.user.findUnique({
    where: { id: user.id },
    include: {
      assigned_store: true,
      managed_stores: true,
    },
  });
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;

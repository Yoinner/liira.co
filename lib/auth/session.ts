import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "liira_admin";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
export type AdminRole = "business" | "technical";

function secret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (process.env.NODE_ENV !== "production") return "liira-local-development-secret";
  throw new Error("AUTH_SECRET no está configurado");
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function createAdminSession(role: AdminRole) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ role, expires })).toString("base64url");
  const token = `${payload}.${sign(payload)}`;
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearAdminSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getAdminSession(): Promise<{ role: AdminRole; expires: number } | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(sign(payload), signature)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      role?: string;
      expires?: number;
    };
    const validRole = parsed.role === "business" || parsed.role === "technical";
    if (!validRole || !parsed.expires || parsed.expires <= Date.now() / 1000) return null;
    return { role: parsed.role as AdminRole, expires: parsed.expires };
  } catch {
    return null;
  }
}

export async function hasAdminSession() {
  return Boolean(await getAdminSession());
}

export async function requireAdmin(role?: AdminRole) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const authorized = !role || session.role === "technical" || session.role === role;
  if (!authorized) redirect("/admin");
  return session;
}

export function resolveAdminRole(username: string): AdminRole | null {
  const businessUsername = process.env.BUSINESS_ADMIN_USERNAME || process.env.ADMIN_USERNAME;
  const technicalUsername = process.env.TECH_ADMIN_USERNAME;
  if (businessUsername && safeEqual(username, businessUsername)) return "business";
  if (technicalUsername && safeEqual(username, technicalUsername)) return "technical";
  return null;
}

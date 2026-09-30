import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "liira_admin";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

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

export async function createAdminSession() {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ role: "admin", expires })).toString("base64url");
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

export async function hasAdminSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(sign(payload), signature)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      role?: string;
      expires?: number;
    };
    return parsed.role === "admin" && Boolean(parsed.expires && parsed.expires > Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function requireAdmin() {
  if (!(await hasAdminSession())) redirect("/admin/login");
}

export function verifyAdminUsername(username: string) {
  const expectedUsername = process.env.ADMIN_USERNAME;
  if (!expectedUsername) return false;
  return safeEqual(username, expectedUsername);
}

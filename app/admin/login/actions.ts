"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminSession, resolveAdminRole } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(200),
});

export type LoginState = { error?: string };

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ username: formData.get("username"), password: formData.get("password") });
  if (!parsed.success) return { error: "Ingresa tu usuario y contraseña." };

  const role = resolveAdminRole(parsed.data.username);
  const stored = role === "technical"
    ? process.env.TECH_ADMIN_PASSWORD_HASH
    : process.env.BUSINESS_ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD_HASH;
  const valid = Boolean(role && stored && verifyPassword(parsed.data.password, stored));
  if (!valid) return { error: "Usuario o contraseña incorrectos." };

  await createAdminSession(role!);
  redirect(role === "technical" ? "/admin/tecnico" : "/admin");
}

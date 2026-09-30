"use client";

import { useActionState } from "react";
import { LockKeyhole } from "lucide-react";
import { loginAction, type LoginState } from "@/app/admin/login/actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  return (
    <form action={action} className="admin-login-form">
      <label>Usuario<input name="username" autoComplete="username" required /></label>
      <label>Contraseña<input name="password" type="password" autoComplete="current-password" minLength={8} required /></label>
      {state.error && <p className="admin-form-error" role="alert">{state.error}</p>}
      <button type="submit" disabled={pending}>{pending ? "Verificando…" : <><LockKeyhole size={17} /> Entrar al panel</>}</button>
    </form>
  );
}

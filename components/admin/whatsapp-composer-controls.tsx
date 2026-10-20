"use client";

import { useFormStatus } from "react-dom";

export function WhatsAppSubmit({ label, busyLabel, disabled = false }: { label: string; busyLabel: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button className="admin-primary" type="submit" disabled={pending || disabled} aria-busy={pending}>{pending ? busyLabel : label}</button>;
}

export function ReplyTextarea() {
  return <div className="wa-composer-input"><textarea name="body" aria-label="Respuesta al cliente" required minLength={1} maxLength={2000} rows={3} placeholder="Escribe desde el número oficial de Liira…" onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      const submit = event.currentTarget.form?.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!submit?.disabled) { event.preventDefault(); event.currentTarget.form?.requestSubmit(submit); }
    }
  }}/><small>Ctrl + Enter para enviar · Tu respuesta pasa la conversación a atención humana.</small></div>;
}

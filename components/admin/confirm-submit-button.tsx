"use client";

import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";

export function ConfirmSubmitButton({ message, label = "Eliminar" }: { message: string; label?: string }) {
  const { pending } = useFormStatus();
  return <button
    className="admin-danger"
    type="submit"
    disabled={pending}
    onClick={(event) => { if (!window.confirm(message)) event.preventDefault(); }}
  >
    <Trash2 size={15} /> {pending ? "Eliminando…" : label}
  </button>;
}

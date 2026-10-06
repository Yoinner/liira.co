"use client";

import { useEffect, useRef, useState } from "react";
import { Moon, Search, Sun, X } from "lucide-react";

export function AdminTools() {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("liira-admin-theme") === "dark";
    document.documentElement.dataset.adminTheme = saved ? "dark" : "light";
    const initialTheme = window.setTimeout(() => setDark(saved), 0);
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(true); }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => { window.clearTimeout(initialTheme); window.removeEventListener("keydown", handler); };
  }, []);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("liira-admin-theme", next ? "dark" : "light");
    document.documentElement.dataset.adminTheme = next ? "dark" : "light";
  }

  return <>
    <div className="admin-tools">
      <button type="button" className="admin-command-trigger" onClick={() => setOpen(true)}><Search size={15} /><span>Buscar en Liira</span><kbd>Ctrl K</kbd></button>
      <button type="button" className="admin-icon-button" onClick={toggleTheme} aria-label={dark ? "Usar modo claro" : "Usar modo oscuro"}>{dark ? <Sun /> : <Moon />}</button>
    </div>
    {open && <div className="command-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="command-dialog" role="dialog" aria-modal="true" aria-label="Búsqueda universal">
        <div className="command-head"><Search /><form action="/admin/buscar"><input ref={input} name="q" minLength={2} maxLength={80} placeholder="Cliente, teléfono, producto o solicitud…" autoComplete="off" /></form><button type="button" onClick={() => setOpen(false)} aria-label="Cerrar"><X /></button></div>
        <div className="command-help"><strong>Búsqueda universal</strong><p>Escribe al menos dos caracteres y presiona Enter. Encontraremos coincidencias en clientes, solicitudes y productos.</p><span>Atajo disponible en todo el panel · Ctrl + K</span></div>
      </div>
    </div>}
  </>;
}

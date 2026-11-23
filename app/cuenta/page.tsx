"use client";

import { useEffect, useState } from "react";

export default function CuentaPage() {
  const [yo, setYo] = useState<{ usuario: string; nombre: string; rol: string } | null>(null);
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { fetch("/api/cuenta").then(r => r.json()).then(setYo).catch(() => {}); }, []);

  async function cambiar(e: React.FormEvent) {
    e.preventDefault();
    if (nueva !== repetir) { setAviso({ ok: false, texto: "Las dos contraseñas nuevas no coinciden." }); return; }
    setOcupado(true); setAviso(null);
    const d = await fetch("/api/cuenta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actual, nueva }) })
      .then(r => r.json()).catch(() => ({ error: "No se ha podido guardar" }));
    setOcupado(false);
    if (d.error) { setAviso({ ok: false, texto: d.error }); return; }
    setActual(""); setNueva(""); setRepetir("");
    setAviso({ ok: true, texto: "Contraseña cambiada. Si tenías la Suite abierta en otro dispositivo, tendrás que volver a entrar allí." });
  }

  return (
    <div className="wrap" style={{ maxWidth: 520 }}>
      <header>
        <h1>Mi cuenta</h1>
        <p>{yo ? `${yo.nombre} · usuario «${yo.usuario}» · ${yo.rol === "admin" ? "administrador" : "equipo"}` : "…"}</p>
      </header>
      {aviso && <div className={aviso.ok ? "adm-ok" : "adm-error"}>{aviso.texto}</div>}
      <form className="card" onSubmit={cambiar}>
        <h2>Cambiar mi contraseña</h2>
        <label>Contraseña actual</label>
        <input type="password" value={actual} onChange={e => setActual(e.target.value)} autoComplete="current-password" required />
        <label>Contraseña nueva (mín. 8 caracteres)</label>
        <input type="password" value={nueva} onChange={e => setNueva(e.target.value)} autoComplete="new-password" required />
        <label>Repite la nueva</label>
        <input type="password" value={repetir} onChange={e => setRepetir(e.target.value)} autoComplete="new-password" required />
        <button type="submit" disabled={ocupado}>Cambiar contraseña</button>
      </form>
      <form method="POST" action="/api/logout">
        <button className="regen-btn">Salir de la Suite</button>
      </form>
    </div>
  );
}

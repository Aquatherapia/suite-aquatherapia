"use client";

import { useEffect, useState } from "react";

type Usuario = { usuario: string; nombre: string; rol: "admin" | "equipo"; activo: boolean; creado: string; ultimoAcceso?: string };
type Movimiento = { t: string; u: string; n?: string; que: string; det?: string };

const fecha = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

async function llamar(cuerpo: object): Promise<{ usuarios?: Usuario[]; error?: string }> {
  const r = await fetch("/api/admin/usuarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  return r.json().catch(() => ({ error: "No se ha podido guardar" }));
}

function Usuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [nuevo, setNuevo] = useState({ nombre: "", usuario: "", contrasena: "", rol: "equipo" });
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [clave, setClave] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    fetch("/api/admin/usuarios").then(r => r.json()).then(d => {
      setUsuarios(d.usuarios ?? []);
      // Primera vez: se propone el usuario «admin» (se puede cambiar)
      if (!(d.usuarios ?? []).length) setNuevo(n => (n.usuario ? n : { ...n, usuario: "admin", nombre: "Administrador" }));
    });
  }, []);
  const arranque = usuarios !== null && usuarios.length === 0;

  async function hacer(cuerpo: object, ok: string) {
    setOcupado(true); setAviso(null);
    const d = await llamar(cuerpo);
    setOcupado(false);
    if (d.error) { setAviso({ ok: false, texto: d.error }); return false; }
    if (d.usuarios) setUsuarios(d.usuarios);
    setAviso({ ok: true, texto: ok });
    return true;
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    const ok = await hacer({ accion: "crear", ...nuevo }, `Usuario «${nuevo.usuario.toLowerCase()}» creado. Pásale su usuario y contraseña en persona o por WhatsApp.`);
    if (ok) setNuevo({ nombre: "", usuario: "", contrasena: "", rol: "equipo" });
  }

  return (
    <>
      {arranque && (
        <div className="adm-aviso">
          Todavía no hay usuarios. Crea primero <b>el usuario administrador</b> (puede llamarse «admin»), con su propia contraseña: al guardarlo entrarás ya con él y la entrada de arranque con la clave de siempre dejará de funcionar.
        </div>
      )}
      {aviso && <div className={aviso.ok ? "adm-ok" : "adm-error"}>{aviso.texto}</div>}

      <div className="adm-lista">
        {usuarios?.map(u => (
          <div key={u.usuario} className={`card adm-usuario${u.activo ? "" : " adm-baja"}`}>
            <div className="adm-cab">
              <div>
                <b>{u.nombre}</b> <span className="adm-gris">· {u.usuario}</span>
                <div className="adm-gris">{u.rol === "admin" ? "Administrador" : "Equipo"}{u.activo ? "" : " · dado de baja"} · último acceso: {fecha(u.ultimoAcceso)}</div>
              </div>
            </div>
            {cambiando === u.usuario ? (
              <form className="adm-fila" onSubmit={async e => { e.preventDefault(); if (await hacer({ accion: "contrasena", usuario: u.usuario, contrasena: clave }, `Contraseña de ${u.nombre} cambiada. Sus sesiones abiertas se han cerrado.`)) { setCambiando(null); setClave(""); } }}>
                <input type="text" placeholder="Contraseña nueva (mín. 8)" value={clave} onChange={e => setClave(e.target.value)} autoComplete="new-password" />
                <button type="submit" disabled={ocupado}>Guardar</button>
                <button type="button" className="regen-btn" onClick={() => { setCambiando(null); setClave(""); }}>Cancelar</button>
              </form>
            ) : (
              <div className="adm-fila">
                <button className="regen-btn" disabled={ocupado} onClick={() => { setCambiando(u.usuario); setClave(""); }}>Cambiar contraseña</button>
                <button className="regen-btn" disabled={ocupado} onClick={() => hacer({ accion: "rol", usuario: u.usuario, rol: u.rol === "admin" ? "equipo" : "admin" }, `${u.nombre} ahora es ${u.rol === "admin" ? "del equipo" : "administrador"}.`)}>
                  {u.rol === "admin" ? "Quitar administrador" : "Hacer administrador"}
                </button>
                <button className="regen-btn" disabled={ocupado} onClick={() => hacer({ accion: "activo", usuario: u.usuario, activo: !u.activo }, u.activo ? `${u.nombre} ya no puede entrar.` : `${u.nombre} puede volver a entrar.`)}>
                  {u.activo ? "Dar de baja" : "Volver a dar de alta"}
                </button>
                {!u.activo && (
                  <button className="regen-btn adm-rojo" disabled={ocupado} onClick={() => { if (window.confirm(`¿Borrar a ${u.nombre} para siempre? Su actividad pasada se queda en el registro.`)) hacer({ accion: "borrar", usuario: u.usuario }, `${u.nombre} borrado.`); }}>
                    Borrar
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {!arranque && usuarios && (
        <div className="card adm-usuario">
          <b>Cerrar todas las sesiones</b>
          <div className="adm-gris">Todos los navegadores y móviles donde alguien tenga la Suite abierta tendrán que volver a entrar con usuario y contraseña. Tú sigues dentro en este.</div>
          <div className="adm-fila">
            <button className="regen-btn" disabled={ocupado} onClick={() => { if (window.confirm("¿Cerrar las sesiones de todos en todos los dispositivos?")) hacer({ accion: "cerrar-sesiones" }, "Sesiones cerradas: los demás tendrán que volver a entrar (en menos de 20 segundos)."); }}>
              Cerrar todas las sesiones
            </button>
          </div>
        </div>
      )}

      <form className="card adm-nuevo" onSubmit={crear}>
        <h2>{arranque ? "Crear el usuario administrador" : "Dar de alta a una persona"}</h2>
        <label>Nombre</label>
        <input value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Andrea" required />
        <label>Usuario (para entrar)</label>
        <input value={nuevo.usuario} onChange={e => setNuevo({ ...nuevo, usuario: e.target.value.toLowerCase() })} placeholder="andrea" autoCapitalize="none" required />
        <label>Contraseña inicial (mín. 8 caracteres)</label>
        <input type="text" value={nuevo.contrasena} onChange={e => setNuevo({ ...nuevo, contrasena: e.target.value })} autoComplete="new-password" required />
        {!arranque && (
          <>
            <label>Permisos</label>
            <select className="rc-select" value={nuevo.rol} onChange={e => setNuevo({ ...nuevo, rol: e.target.value })}>
              <option value="equipo">Equipo: usa todas las herramientas</option>
              <option value="admin">Administrador: además entra en Administración</option>
            </select>
          </>
        )}
        <button type="submit" disabled={ocupado}>{arranque ? "Crear y entrar con él" : "Dar de alta"}</button>
        <p className="adm-gris">Cada persona puede cambiar su contraseña en «Mi cuenta», abajo del menú.</p>
      </form>
    </>
  );
}

function Actividad() {
  const [movs, setMovs] = useState<Movimiento[] | null>(null);
  const [persona, setPersona] = useState("");
  const [mas, setMas] = useState(true);

  async function cargar(desde: number) {
    const d = await fetch(`/api/admin/actividad?desde=${desde}`).then(r => r.json());
    const nuevos: Movimiento[] = d.movimientos ?? [];
    setMovs(prev => (desde === 0 ? nuevos : [...(prev ?? []), ...nuevos]));
    setMas(nuevos.length === 300);
  }
  useEffect(() => { cargar(0); }, []);

  const personas = Array.from(new Set((movs ?? []).map(m => m.n || m.u)));
  const vistos = (movs ?? []).filter(m => !persona || (m.n || m.u) === persona);

  return (
    <div className="card">
      <div className="adm-fila adm-filtro">
        <select className="rc-select" value={persona} onChange={e => setPersona(e.target.value)}>
          <option value="">Todas las personas</option>
          {personas.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      {movs === null && <p className="adm-gris">Cargando…</p>}
      {movs?.length === 0 && <p className="adm-gris">Todavía no hay nada apuntado.</p>}
      <ul className="adm-actividad">
        {vistos.map((m, i) => (
          <li key={i}>
            <span className="adm-gris">{fecha(m.t)}</span>
            <span><b>{m.n || m.u}</b> · {m.que}{m.det ? <span className="adm-gris"> · {m.det}</span> : null}</span>
          </li>
        ))}
      </ul>
      {movs && mas && <button className="regen-btn" onClick={() => cargar(movs.length)}>Ver más</button>}
      <p className="adm-gris">Se apunta cada vez que alguien entra, sale o cambia algo en una herramienta (guardar, revisar, publicar, marcar…). Solo mirar no se apunta. Se guardan los últimos 3.000 movimientos.</p>
    </div>
  );
}

export default function AdminPage() {
  const [pestana, setPestana] = useState<"usuarios" | "actividad">("usuarios");
  return (
    <div className="wrap">
      <header>
        <h1>Administración</h1>
        <p>Usuarios de la Suite y registro de lo que hace cada persona</p>
      </header>
      <div className="adm-pestanas">
        <button className={pestana === "usuarios" ? "on" : ""} onClick={() => setPestana("usuarios")}>Usuarios</button>
        <button className={pestana === "actividad" ? "on" : ""} onClick={() => setPestana("actividad")}>Actividad</button>
      </div>
      {pestana === "usuarios" ? <Usuarios /> : <Actividad />}
    </div>
  );
}

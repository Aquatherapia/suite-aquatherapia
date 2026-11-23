import { rutaInterna } from "../../lib/acceso";
import { leerUsuarios } from "../../lib/usuarios";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; u?: string; salir?: string }>;
}) {
  const params = await searchParams;
  const next = rutaInterna(params.next);
  const error = params.error;
  // Sin usuarios todavía: se entra como «admin» con la clave de la web para darlos de alta
  const arranque = !Object.keys(await leerUsuarios().catch(() => ({ x: 1 }))).length;

  return (
    <div className="wrap" style={{ maxWidth: 400, marginTop: "15vh" }}>
      <header className="home-header">
        <div className="home-logo">La Tienda de Cosméticos</div>
        <h1>Herramientas IA</h1>
        <p>{arranque ? "Primera vez: entra con el usuario «admin» y la clave de siempre para crear los usuarios" : "Entra con tu usuario y tu contraseña"}</p>
      </header>

      <form method="POST" action="/api/login" className="login-form">
        <input type="hidden" name="next" value={next} />
        <input
          type="text"
          name="usuario"
          placeholder="Usuario"
          defaultValue={params.u ?? (arranque ? "admin" : "")}
          autoComplete="username"
          autoCapitalize="none"
          autoFocus={!params.u}
          required
        />
        <input
          type="password"
          name="password"
          placeholder="Contraseña"
          autoComplete="current-password"
          autoFocus={!!params.u}
          required
        />
        <button type="submit">Entrar</button>
        {error === "1" && <p className="error">Usuario o contraseña incorrectos</p>}
        {error === "2" && <p className="error">Demasiados intentos fallidos. Espera 15 minutos y vuelve a probar.</p>}
        {params.salir === "1" && <p>Has salido de la Suite.</p>}
      </form>
    </div>
  );
}

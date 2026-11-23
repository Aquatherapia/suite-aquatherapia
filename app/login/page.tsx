import { rutaInterna } from "../../lib/acceso";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = rutaInterna(params.next);
  const error = params.error;

  return (
    <div className="wrap" style={{ maxWidth: 400, marginTop: "15vh" }}>
      <header className="home-header">
        <div className="home-logo">La Tienda de Cosméticos</div>
        <h1>Herramientas IA</h1>
        <p>Introduce la clave de acceso</p>
      </header>

      <form method="POST" action="/api/login">
        <input type="hidden" name="next" value={next} />
        <input
          type="password"
          name="password"
          placeholder="Clave de acceso"
          autoFocus
          required
        />
        <button type="submit">Entrar</button>
        {error === "1" && <p className="error">Clave incorrecta</p>}
        {error === "2" && <p className="error">Demasiados intentos fallidos. Espera 15 minutos y vuelve a probar.</p>}
      </form>
    </div>
  );
}

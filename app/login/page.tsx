export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ?? "/";
  const hasError = params.error === "1";

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
        {hasError && <p className="error">Clave incorrecta</p>}
      </form>
    </div>
  );
}

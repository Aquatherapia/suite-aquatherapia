import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Herramientas IA — La Tienda de Cosméticos",
  description: "Herramientas con IA para La Tienda de Cosméticos",
  icons: { icon: "/favicon-32x32.png", apple: "/apple-touch-icon.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        {/* Las mismas letras que latiendadecosmeticos.com: Poppins en títulos y Barlow en el texto */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Semi+Condensed:wght@500;600&family=Poppins:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <div className="franja">Herramientas internas · Salamanca</div>
        <nav className="barra">
          <Link href="/" className="barra-logo" aria-label="Inicio">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-latienda.png" alt="La Tienda de Cosméticos" width={134} height={50} />
          </Link>
          <Link href="/" className="barra-inicio">Herramientas</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}

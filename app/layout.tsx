import "./globals.css";
import Navegacion from "./navegacion";

export const metadata = {
  title: "Herramientas — La Tienda de Cosméticos",
  description: "Herramientas internas de La Tienda de Cosméticos y Aquatherapia",
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        <Navegacion>{children}</Navegacion>
      </body>
    </html>
  );
}

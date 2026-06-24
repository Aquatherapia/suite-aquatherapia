import "./globals.css";

export const metadata = {
  title: "Generador de fichas de producto",
  description: "La Tienda de Cosméticos — generador de fichas de producto con IA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

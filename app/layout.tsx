import "./globals.css";

export const metadata = {
  title: "Herramientas IA — La Tienda de Cosméticos",
  description: "Herramientas con IA para La Tienda de Cosméticos",
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

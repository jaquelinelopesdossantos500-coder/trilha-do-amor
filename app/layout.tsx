import type { Metadata } from "next";
import "./globals.css";
import "./preparation.css";
export const metadata: Metadata = {
  title: "Trilha do Amor · Um reencontro para guardar",
  description: "Transforme suas fotos em uma recriação artística de reencontro. Escolha seu cenário e crie uma lembrança especial com o Trilha do Amor.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}

import type { Metadata } from "next";
import { Rajdhani, Montserrat } from "next/font/google";
import "./globals.css";

import { FallbackPurger } from "@/components/system/fallback-purger";

const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Start Academy — Diagnostic & Parcours de formation",
  description:
    "Plateforme interne Start Academy. Transformer un rendez-vous client en parcours de formation personnalisé.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${rajdhani.variable} ${montserrat.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground font-sans">
        <FallbackPurger />
        {children}
      </body>
    </html>
  );
}

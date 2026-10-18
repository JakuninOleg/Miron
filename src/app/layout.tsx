import type { Metadata, Viewport } from "next";
import "@fontsource/manrope/cyrillic-400.css";
import "@fontsource/manrope/cyrillic-600.css";
import "@fontsource/manrope/cyrillic-700.css";
import "@fontsource/manrope/cyrillic-800.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "@fontsource/neucha/cyrillic-400.css";
import "@fontsource/neucha/latin-400.css";
import "@fontsource/oswald/cyrillic-500.css";
import "@fontsource/oswald/cyrillic-600.css";
import "@fontsource/oswald/latin-600.css";
import "@fontsource/rubik/cyrillic-800.css";
import "@fontsource/rubik/latin-800.css";
import "./globals.css";
import { AppProviders } from "@/components/app-providers";

export const metadata: Metadata = {
  title: { default: "MIRON — твой напарник", template: "%s — MIRON" },
  description: "Тренировки, движение и прогресс рядом с Максом и Ликой.",
  manifest: "/site.webmanifest",
  applicationName: "MIRON",
  appleWebApp: { capable: true, title: "MIRON", statusBarStyle: "black-translucent" },
  icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#17191a",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" data-scroll-behavior="smooth">
      <body
        style={
          {
            "--font-manrope": '"Manrope", sans-serif',
            "--font-oswald": '"Oswald", sans-serif',
            "--font-neucha": '"Neucha", cursive',
            "--font-rubik": '"Rubik", sans-serif',
          } as React.CSSProperties
        }
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

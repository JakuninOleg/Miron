// Шаблон для будущего Next.js App Router, а не подключённый модуль приложения.
// Перенесите эти exports в app/layout.tsx или src/app/layout.tsx,
// когда появится приложение. Не создавайте второй app/manifest.ts:
// источником manifest здесь служит public/site.webmanifest.
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  applicationName: "MIRON",
  title: "MIRON",
  description: "Персональный напарник для тренировок",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon", sizes: "16x16 32x32 48x48" },
      { url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "MIRON",
    statusBarStyle: "default",
  },
};

// В актуальном Next.js themeColor задаётся через viewport, а не metadata.
// Масштабирование пользователем не ограничиваем.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#141416",
};

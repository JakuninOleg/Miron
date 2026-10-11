"use client";

import { usePathname } from "next/navigation";
import { MironProvider } from "@/client/use-miron";

/** Public story previews never hydrate private account/offline state. */
export function AppProviders({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  if (
    pathname === "/story" ||
    pathname?.startsWith("/story/") ||
    pathname === "/workout-builder" ||
    pathname === "/auth/continue"
  )
    return children;
  return <MironProvider>{children}</MironProvider>;
}

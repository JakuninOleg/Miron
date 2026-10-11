"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function Demo() {
  const router = useRouter();
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("legacy") === "1") {
      sessionStorage.setItem("miron:demo", "1");
      window.location.replace("/onboarding");
    } else {
      sessionStorage.removeItem("miron:demo");
      window.location.replace("/story");
    }
  }, [router]);
  return <main style={{ padding: 40 }}>Открываем MIRON…</main>;
}

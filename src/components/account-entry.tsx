"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function AccountEntry({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    try {
      sessionStorage.removeItem("miron:demo");
    } catch {
      /* Storage is optional. */
    }
    void fetch(`/api/account-entry${next === "/workout-builder" ? "?next=/workout-builder" : ""}`, {
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/sign-in");
          return;
        }
        if (!response.ok) throw new Error("Не удалось открыть аккаунт. Попробуй ещё раз.");
        const result: unknown = await response.json();
        const destination =
          result && typeof result === "object" && "destination" in result
            ? result.destination
            : null;
        if (
          typeof destination !== "string" ||
          ![
            "/dashboard",
            "/workout-builder",
            "/onboarding",
            "/onboarding?next=/workout-builder",
          ].includes(destination)
        )
          throw new Error("Не удалось определить следующий шаг.");
        router.replace(destination);
      })
      .catch((cause: unknown) => {
        if (!abort.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Нет связи с сервером.");
      });
    return () => abort.abort();
  }, [next, router]);
  return (
    <main className="loading-state" aria-busy={!error}>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <Link href="/sign-in">Вернуться ко входу</Link>
        </div>
      ) : (
        "Открываем MIRON…"
      )}
    </main>
  );
}

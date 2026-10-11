import { Suspense } from "react";
import { AuthScreen } from "@/components/auth-screen";

export default function Page() {
  return (
    <Suspense fallback={<div className="loading-state">Загружаем…</div>}>
      <AuthScreen mode="reset-password" />
    </Suspense>
  );
}

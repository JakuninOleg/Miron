"use client";
import { useMiron } from "@/client/use-miron";
import { AccountDashboard } from "./account-dashboard";
import { DashboardScreen } from "./dashboard-screen";
import { AccountOnboarding } from "./account-onboarding";
import { OnboardingScreen } from "./onboarding-screen";

export function ProductDashboard({ today, allowReplay }: { today: string; allowReplay: boolean }) {
  const account = useMiron();
  return account.isDemo ? (
    <DashboardScreen />
  ) : (
    <AccountDashboard today={today} allowReplay={allowReplay} />
  );
}
export function ProductOnboarding({
  replay,
  next,
}: {
  replay: boolean;
  next?: "/dashboard" | "/workout-builder";
}) {
  const account = useMiron();
  return account.isDemo ? <OnboardingScreen /> : <AccountOnboarding replay={replay} next={next} />;
}

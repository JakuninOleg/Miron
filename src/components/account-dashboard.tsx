"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMiron } from "@/client/use-miron";
import type { CompanionId } from "@/shared/contracts";
import { isTerminalWorkout } from "@/shared/xp-policy";
import { DashboardPreview } from "./dashboard-preview";
import type { AccountDashboardRuntime } from "./account-dashboard-runtime";
import styles from "./dashboard-preview.module.css";

export function AccountDashboard({ today, allowReplay }: { today: string; allowReplay: boolean }) {
  const miron = useMiron();
  const router = useRouter();
  const [companionBusy, setCompanionBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());
  const companionLocked = Boolean(miron.workout && !isTerminalWorkout(miron.workout.status));

  async function selectCompanion(id: CompanionId) {
    if (companionLocked || companionBusy || id === miron.profile.companion) return;
    setCompanionBusy(true);
    setLocalError(null);
    try {
      await miron.switchCompanion(id);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "Не удалось сменить напарника.");
    } finally {
      setCompanionBusy(false);
    }
  }

  async function logout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    setLocalError(null);
    try {
      await miron.logout();
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "Не удалось выйти из аккаунта.");
      setLogoutBusy(false);
    }
  }

  if (!miron.isReady || !miron.ownerId || !miron.profile.onboardingCompleted)
    return (
      <div className={`${styles.shell} ${styles.loading}`} role="status">
        Готовим твой день…
      </div>
    );

  const accountRuntime: AccountDashboardRuntime = {
    profile: miron.profile,
    trial: miron.trial,
    progress: miron.progress,
    workout: miron.workout,
    messages: miron.messages,
    isOnline: miron.isOnline,
    isSending: miron.isSending,
    assistantEnabled: miron.assistantEnabled,
    assistantLoading: miron.assistantLoading,
    assistantHasMore: miron.assistantHasMore,
    assistantHistoryBusy: miron.assistantHistoryBusy,
    assistantEditing: miron.assistantEditing,
    assistantHistoryRevision: miron.assistantHistoryRevision,
    assistantError: miron.assistantError,
    pendingAssistantText: miron.pendingAssistantText,
    confirmedAssistantActions: miron.confirmedAssistantActions,
    pendingCount: miron.pendingCount,
    error: localError ?? miron.error,
    companionLocked,
    companionBusy,
    logoutBusy,
    trialActive: new Date(miron.trial.endsAt).getTime() > openedAt,
    allowReplay,
    onSend: miron.sendMessage,
    onRetryAssistant: miron.retryAssistant,
    onRefreshAssistant: miron.refreshAssistant,
    onLoadOlderAssistant: miron.loadOlderAssistant,
    onEditAssistantHistory: miron.editAssistantHistory,
    onConfirmAssistantAction: miron.confirmAssistantAction,
    onLogout: logout,
    onSync: miron.syncPending,
  };

  return (
    <DashboardPreview
      companion={miron.profile.companion}
      interests={miron.profile.interests ?? []}
      today={today}
      accountRuntime={accountRuntime}
      onSelectCompanion={(id) => void selectCompanion(id)}
      onReplay={() => router.push("/onboarding?replay=1")}
    />
  );
}

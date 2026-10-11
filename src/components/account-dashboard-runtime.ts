import type { AccountState, Progress, Workout } from "@/shared/contracts";
import type { AssistantChatMessage, AssistantEnergyAction } from "@/shared/assistant";

/** Account data and actions supplied by the authenticated provider, never by story preview. */
export interface AccountDashboardRuntime extends AccountState {
  messages: AssistantChatMessage[];
  workout: Workout | null;
  isOnline: boolean;
  isSending: boolean;
  assistantEnabled: boolean | null;
  assistantLoading: boolean;
  assistantError: string | null;
  pendingAssistantText: string | null;
  confirmedAssistantActions: string[];
  pendingCount: number;
  error: string | null;
  companionLocked: boolean;
  companionBusy: boolean;
  logoutBusy: boolean;
  trialActive: boolean;
  allowReplay: boolean;
  onSend: (text: string) => Promise<void>;
  onRetryAssistant: () => Promise<void>;
  onRefreshAssistant: () => Promise<void>;
  onConfirmAssistantAction: (action: AssistantEnergyAction) => Promise<void>;
  onLogout: () => Promise<void>;
  onSync: () => Promise<void>;
}

// These are the account milestones already used on the progress screen.
export const ACCOUNT_DASHBOARD_ACHIEVEMENTS = [
  { id: "first", title: "Первый шаг", description: "Завершить первое занятие", goal: 1 },
  { id: "rhythm", title: "Снова в деле", description: "Завершить три занятия", goal: 3 },
  { id: "return", title: "Своя привычка", description: "Завершить десять занятий", goal: 10 },
] as const;

export function dashboardLevel(xp: number) {
  return { level: Math.floor(xp / 500) + 1, levelXp: xp % 500 };
}

export function dashboardAchievements(progress: Progress) {
  return ACCOUNT_DASHBOARD_ACHIEVEMENTS.map((achievement) => ({
    ...achievement,
    earned: progress.completedWorkouts >= achievement.goal,
  }));
}

import type { AccountState, Progress, Workout } from "@/shared/contracts";
import { ACHIEVEMENTS } from "@/shared/progress-milestones";
import type {
  AssistantChatMessage,
  AssistantEnergyAction,
  AssistantHistoryAction,
} from "@/shared/assistant";
import type { CompanionId } from "@/shared/contracts";

/** Account data and actions supplied by the authenticated provider, never by story preview. */
export interface AccountDashboardRuntime extends AccountState {
  messages: AssistantChatMessage[];
  workout: Workout | null;
  isOnline: boolean;
  isSending: boolean;
  assistantEnabled: boolean | null;
  assistantLoading: boolean;
  assistantHasMore: boolean;
  assistantHistoryBusy: boolean;
  assistantEditing: boolean;
  assistantHistoryRevision: number | null;
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
  onLoadOlderAssistant: () => Promise<void>;
  onEditAssistantHistory: (
    companion: CompanionId,
    action: AssistantHistoryAction,
    expectedRevision?: number,
  ) => Promise<void>;
  onConfirmAssistantAction: (action: AssistantEnergyAction) => Promise<void>;
  onLogout: () => Promise<void>;
  onSync: () => Promise<void>;
}

// These are the account milestones already used on the progress screen.
export { ACHIEVEMENTS as ACCOUNT_DASHBOARD_ACHIEVEMENTS } from "@/shared/progress-milestones";

export function dashboardLevel(xp: number) {
  return { level: Math.floor(xp / 500) + 1, levelXp: xp % 500 };
}

export function dashboardAchievements(progress: Progress) {
  return ACHIEVEMENTS.map((achievement) => ({
    ...achievement,
    earned: progress.completedWorkouts >= achievement.goal,
  }));
}

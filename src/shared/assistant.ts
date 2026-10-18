import type {
  ChatMessage,
  CommandAck,
  CompanionId,
  WorkoutEnergyEstimate,
  WorkoutEnergyInput,
} from "./contracts";

export interface AssistantPlannerAction {
  id: string;
  type: "planner";
  title: string;
  href: string;
}

/** A server-owned proposal. Applying it always requires explicit confirmation. */
export interface AssistantEnergyAction {
  id: string;
  type: "energy_estimate";
  title: string;
  workoutId: string;
  expectedRevision: number;
  input: WorkoutEnergyInput;
  operationId: string;
  summary: string;
  estimate?: WorkoutEnergyEstimate;
  confirmed?: boolean;
}

export type AssistantAction = AssistantPlannerAction | AssistantEnergyAction;

export interface AssistantChatMessage extends ChatMessage {
  replyState?: "pending" | "failed";
  operationId?: string;
  companion?: CompanionId;
  source?: "model" | "prepared";
  actions?: AssistantAction[];
}

export interface AssistantHistory {
  enabled: boolean;
  companion: CompanionId;
  revision: number;
  resetRevision: number;
  nextCursor: string | null;
  pending?: {
    operationId: string;
    state: "running" | "completed" | "failed" | "removed" | "absent";
  };
  messages: AssistantChatMessage[];
}

export type AssistantHistoryAction =
  | { type: "delete_message"; turnId: string; role: "user" | "assistant" }
  | { type: "delete_turn"; turnId: string }
  | { type: "clear" };
export interface AssistantHistoryMutation {
  operationId: string;
  companion: CompanionId;
  expectedRevision: number;
  action: AssistantHistoryAction;
}
export interface AssistantHistoryReceipt {
  operationId: string;
  companion: CompanionId;
  revision: number;
}

export interface AssistantRequest {
  operationId: string;
  text: string;
  expectedHistoryRevision?: number;
  companion?: CompanionId;
}

export interface AssistantReply {
  operationId: string;
  messages: AssistantChatMessage[];
  /** Absent only on replies persisted before chat history versioning. */
  historyRevision?: number;
}

export interface AssistantActionRequest {
  proposalId: string;
  operationId: string;
}

export type AssistantActionReply = CommandAck;

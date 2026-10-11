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
  operationId?: string;
  companion?: CompanionId;
  source?: "model" | "prepared";
  actions?: AssistantAction[];
}

export interface AssistantHistory {
  enabled: boolean;
  messages: AssistantChatMessage[];
}

export interface AssistantRequest {
  operationId: string;
  text: string;
}

export interface AssistantReply {
  operationId: string;
  messages: AssistantChatMessage[];
}

export interface AssistantActionRequest {
  proposalId: string;
  operationId: string;
}

export type AssistantActionReply = CommandAck;

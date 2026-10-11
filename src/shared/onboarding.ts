import type { CompanionId } from "./contracts";

export interface CompleteOnboardingInput {
  operationId: string;
  companion: CompanionId;
  interests: string[];
  adultConfirmed: true;
}

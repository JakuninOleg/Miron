export interface CommunicationPreferences {
  address?: "informal" | "formal";
  tone?: "friendly" | "calm" | "energetic";
  detail?: "short" | "detailed";
  emoji?: "none" | "some";
}
export type MemoryScope = "shared" | "max" | "lika";
export interface CommunicationMemory {
  scope: MemoryScope;
  revision: number;
  preferences: CommunicationPreferences;
}

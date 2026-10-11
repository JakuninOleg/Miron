export const VOICE_MAX_SECONDS = 60;
export const VOICE_MAX_AUDIO_BYTES = 5 * 1024 * 1024;
export const VOICE_MAX_TEXT_LENGTH = 2000;
export const VOICE_OFFLINE_NOTICE =
  "Голосовой ввод доступен с интернетом. Пока можно вводить текст.";

export interface VoiceTranscript {
  operationId: string;
  text: string;
  provider: "groq" | "local";
  model: string;
  durationMs: number;
}

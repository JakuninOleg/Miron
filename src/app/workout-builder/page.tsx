import type { Metadata } from "next";
import { WorkoutBuilder } from "@/components/workout-builder/workout-builder";
import { plannerConfigInput } from "@/server/domain/workout-planner";
import type { PlannerConfig } from "@/shared/workout-planner";

export const metadata: Metadata = { title: "Собрать тренировку" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    theme?: string;
    from?: string;
    mode?: string;
    assistantConfig?: string | string[];
  }>;
}) {
  const query = await searchParams;
  let assistantConfig: PlannerConfig | undefined;
  let assistantConfigInvalid = false;
  if (query.assistantConfig !== undefined) {
    try {
      if (typeof query.assistantConfig !== "string" || query.assistantConfig.length > 12000)
        throw new Error("Invalid assistant configuration");
      const parsed: unknown = JSON.parse(query.assistantConfig);
      const result = plannerConfigInput.safeParse(parsed);
      if (!result.success || (query.mode !== undefined && query.mode !== result.data.mode))
        throw new Error("Invalid assistant configuration");
      assistantConfig = result.data;
    } catch {
      assistantConfigInvalid = true;
    }
  }
  return (
    <WorkoutBuilder
      initialTheme={query.theme === "rose" ? "rose" : "dark"}
      backHref={
        query.from === "assistant" ? "/chat" : query.from === "story" ? "/story/home" : "/dashboard"
      }
      initialMode={
        assistantConfig?.mode ??
        (query.mode === "single" || query.mode === "program" ? query.mode : undefined)
      }
      initialAssistantConfig={assistantConfig}
      assistantConfigInvalid={assistantConfigInvalid}
    />
  );
}

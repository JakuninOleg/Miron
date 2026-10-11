"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useStoryPreview } from "@/client/story-preview";
import { DashboardPreview } from "./dashboard-preview";
import styles from "./dashboard-preview.module.css";

export function StoryHome({ today }: { today: string }) {
  const router = useRouter();
  const story = useStoryPreview();
  const coach = story.state.companion ?? "max";
  useEffect(() => {
    if (story.ready && !story.state.completed) router.replace("/story");
  }, [router, story.ready, story.state.completed]);
  if (!story.ready || !story.state.completed)
    return (
      <main className={styles.loading} aria-busy="true">
        Открываем твою историю…
      </main>
    );
  return (
    <DashboardPreview
      companion={coach}
      interests={story.state.interests}
      today={today}
      onSelectCompanion={story.selectCompanion}
      onReplay={() => {
        story.replay();
        router.push("/story");
      }}
    />
  );
}

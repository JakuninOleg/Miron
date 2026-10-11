"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { StoryPreviewProvider } from "@/client/story-preview";
import { useMiron } from "@/client/use-miron";
import { StoryOnboarding } from "./story-onboarding";
import styles from "./story-preview.module.css";

/** The public /story preview has its own provider and never mounts this account adapter. */
export function AccountOnboarding({
  replay = false,
  next = "/dashboard",
}: {
  replay?: boolean;
  next?: "/dashboard" | "/workout-builder";
}) {
  const router = useRouter();
  const miron = useMiron();
  const destination = replay ? "/dashboard" : next;
  const completed = miron.profile.onboardingCompleted;
  useEffect(() => {
    if (miron.isReady && miron.ownerId && completed && !replay) router.replace(destination);
  }, [completed, destination, miron.isReady, miron.ownerId, replay, router]);

  if (!miron.isReady || !miron.ownerId || (completed && !replay))
    return (
      <main className={styles.loading} aria-busy="true">
        Открываем твою историю…
      </main>
    );

  const preferences = {
    companion: miron.profile.companion,
    interests: miron.profile.interests,
  };
  return (
    <StoryPreviewProvider
      session={
        replay
          ? { mode: "replay", ownerId: miron.ownerId, preferences }
          : {
              mode: "account",
              ownerId: miron.ownerId,
              preferences,
              onComplete: miron.completeOnboarding,
            }
      }
    >
      <StoryOnboarding completionHref={destination} />
    </StoryPreviewProvider>
  );
}

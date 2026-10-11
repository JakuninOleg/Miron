"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useStoryPreview } from "@/client/story-preview";
import { STORY_PANELS } from "@/shared/story-content";
import { StoryFinaleScreen } from "@/components/story-finale-screen";
import { StoryFirstScreen } from "@/components/story-first-screen";
import { StoryMaxScreen } from "@/components/story-max-screen";
import { StoryLikaScreen } from "@/components/story-lika-screen";
import { StoryInterestsScreen } from "@/components/story-interests-screen";
import { StoryChooseScreen } from "@/components/story-choose-screen";
import styles from "./story-preview.module.css";

type Panel = (typeof STORY_PANELS)[number];

export function StoryOnboarding({
  completionHref = "/story/home",
}: {
  completionHref?: "/story/home" | "/dashboard" | "/workout-builder";
} = {}) {
  const router = useRouter();
  const story = useStoryPreview();
  const [leaving, setLeaving] = useState<Panel | null>(null);
  const [direction, setDirection] = useState("forward");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasNavigated = useRef(false);
  const panel = STORY_PANELS[story.state.step] ?? STORY_PANELS[0];
  const coach = story.state.companion;
  const locked = leaving !== null || story.completing;

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );
  useEffect(() => {
    if (!story.ready || (!hasNavigated.current && story.state.step === 0)) return;
    const focusTimer = setTimeout(
      () => titleRef.current?.focus({ preventScroll: true }),
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 330,
    );
    return () => clearTimeout(focusTimer);
  }, [story.ready, story.state.step]);
  useEffect(() => {
    if (story.ready && story.state.completed) router.replace(completionHref);
  }, [completionHref, router, story.ready, story.state.completed]);

  function navigate(step: number) {
    if (locked) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    hasNavigated.current = true;
    window.scrollTo({ top: 0, behavior: "instant" });
    setDirection(step < story.state.step ? "back" : "forward");
    if (!reduced) {
      setLeaving(panel);
      timerRef.current = setTimeout(() => setLeaving(null), 320);
    }
    story.goToStep(step);
  }

  async function next() {
    if (locked) return;
    if (panel.kind === "finish") {
      await story.complete();
    } else navigate(story.state.step + 1);
  }

  if (!story.ready)
    return (
      <main className={styles.loading} aria-busy="true">
        Знакомимся с MIRON…
      </main>
    );
  if (story.state.step === 0) return <StoryFirstScreen onNext={next} />;
  if (story.state.step === 1)
    return (
      <StoryMaxScreen
        onNext={next}
        onBack={() => navigate(0)}
        titleRef={titleRef}
        busy={locked}
        direction={direction}
      />
    );
  if (story.state.step === 2)
    return (
      <StoryLikaScreen
        onNext={next}
        onBack={() => navigate(1)}
        titleRef={titleRef}
        busy={locked}
        direction={direction}
      />
    );
  if (story.state.step === 3)
    return (
      <StoryInterestsScreen
        interests={story.state.interests}
        onToggleInterest={story.toggleInterest}
        onNext={next}
        onBack={() => navigate(2)}
        titleRef={titleRef}
        busy={locked}
        direction={direction}
      />
    );
  if (panel.kind === "choose")
    return (
      <StoryChooseScreen
        companion={coach}
        onSelect={story.selectCompanion}
        onNext={next}
        onBack={() => navigate(story.state.step - 1)}
        titleRef={titleRef}
        busy={locked}
        direction={direction}
        step={story.state.step + 1}
        total={STORY_PANELS.length}
      />
    );
  return (
    <StoryFinaleScreen
      kind={panel.kind === "prepare" ? "prepare" : "finish"}
      companion={coach ?? "max"}
      onNext={next}
      titleRef={titleRef}
      busy={locked}
      direction={direction}
      step={story.state.step + 1}
      adultConfirmation={
        story.mode === "account"
          ? { confirmed: story.adultConfirmed, onChange: story.setAdultConfirmed }
          : undefined
      }
      saving={story.completing}
      error={story.completionError}
    />
  );
}

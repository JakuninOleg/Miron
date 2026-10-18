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

export function StoryOnboarding({
  completionHref = "/story/home",
}: {
  completionHref?: "/story/home" | "/dashboard" | "/workout-builder";
} = {}) {
  const router = useRouter();
  const story = useStoryPreview();
  const [navigating, setNavigating] = useState(false);
  const [direction, setDirection] = useState("forward");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const navigatingRef = useRef(false);
  const mounted = useRef(true);
  const loadedArt = useRef(new Map<string, Promise<void>>());
  const hasNavigated = useRef(false);
  const panel = STORY_PANELS[story.state.step] ?? STORY_PANELS[0];
  const coach = story.state.companion;
  const locked = navigating || story.completing;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function warmScene(step: number) {
    const scene = STORY_PANELS[step];
    if (!scene) return Promise.resolve();
    const portrait = window.matchMedia("(max-aspect-ratio: 6/5) and (min-height: 451px)").matches;
    const src = portrait ? scene.image.replace("-v2.webp", "-mobile-v2.webp") : scene.image;
    const cached = loadedArt.current.get(src);
    if (cached) return cached;
    const asset = new window.Image();
    asset.src = src;
    // Decode public art before swapping screens; a failed image never blocks navigation.
    const ready = asset.decode().catch(() => undefined);
    loadedArt.current.set(src, ready);
    return ready;
  }
  useEffect(() => {
    if (!story.ready) return;
    void warmScene(story.state.step + 1);
    void warmScene(story.state.step + 2);
  }, [story.ready, story.state.step]);
  useEffect(() => {
    if (!story.ready || (!hasNavigated.current && story.state.step === 0)) return;
    titleRef.current?.focus({ preventScroll: true });
  }, [story.ready, story.state.step]);
  useEffect(() => {
    if (story.ready && story.state.completed) router.replace(completionHref);
  }, [completionHref, router, story.ready, story.state.completed]);

  async function navigate(step: number) {
    if (locked || navigatingRef.current) return;
    navigatingRef.current = true;
    setNavigating(true);
    await warmScene(step);
    if (!mounted.current) return;
    hasNavigated.current = true;
    window.scrollTo({ top: 0, behavior: "instant" });
    setDirection(step < story.state.step ? "back" : "forward");
    story.goToStep(step);
    navigatingRef.current = false;
    setNavigating(false);
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

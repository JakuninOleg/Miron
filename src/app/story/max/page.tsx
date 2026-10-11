"use client";

import { useRouter } from "next/navigation";
import { useStoryPreview } from "@/client/story-preview";
import { StoryMaxScreen } from "@/components/story-max-screen";

export default function MaxScreenPreview() {
  const router = useRouter();
  const story = useStoryPreview();
  function openStep(step: number) {
    story.replay();
    story.goToStep(step);
    router.push("/story");
  }
  return <StoryMaxScreen onNext={() => openStep(2)} onBack={() => openStep(0)} />;
}

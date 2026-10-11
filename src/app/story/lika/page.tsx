"use client";

import { useRouter } from "next/navigation";
import { useStoryPreview } from "@/client/story-preview";
import { StoryLikaScreen } from "@/components/story-lika-screen";

export default function LikaScreenPreview() {
  const router = useRouter();
  const story = useStoryPreview();
  function openStep(step: number) {
    story.replay();
    story.goToStep(step);
    router.push("/story");
  }
  return <StoryLikaScreen onNext={() => openStep(3)} onBack={() => openStep(1)} />;
}

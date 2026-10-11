"use client";

import { useRouter } from "next/navigation";
import { useStoryPreview } from "@/client/story-preview";
import { StoryInterestsScreen } from "@/components/story-interests-screen";

export default function InterestsScreenPreview() {
  const router = useRouter();
  const story = useStoryPreview();
  function openStep(step: number) {
    story.goToStep(step);
    router.push("/story");
  }
  return (
    <StoryInterestsScreen
      interests={story.state.interests}
      onToggleInterest={story.toggleInterest}
      onNext={() => openStep(4)}
      onBack={() => openStep(2)}
    />
  );
}

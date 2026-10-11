"use client";

import { useRouter } from "next/navigation";
import { useStoryPreview } from "@/client/story-preview";
import { StoryChooseScreen } from "@/components/story-choose-screen";

export default function ChooseScreenPreview() {
  const router = useRouter();
  const story = useStoryPreview();
  function openStep(step: number) {
    story.goToStep(step);
    router.push("/story");
  }
  return (
    <StoryChooseScreen
      companion={story.state.companion}
      onSelect={story.selectCompanion}
      onNext={() => {
        if (story.state.companion) openStep(5);
      }}
      onBack={() => openStep(3)}
    />
  );
}

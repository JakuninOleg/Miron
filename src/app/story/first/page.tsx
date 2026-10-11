"use client";

import { useRouter } from "next/navigation";
import { useStoryPreview } from "@/client/story-preview";
import { StoryFirstScreen } from "@/components/story-first-screen";

export default function FirstScreenPreview() {
  const router = useRouter();
  const story = useStoryPreview();
  return (
    <StoryFirstScreen
      onNext={() => {
        story.replay();
        story.goToStep(1);
        router.push("/story");
      }}
    />
  );
}

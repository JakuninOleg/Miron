import { StoryPreviewProvider } from "@/client/story-preview";

export default function StoryLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <StoryPreviewProvider>{children}</StoryPreviewProvider>;
}

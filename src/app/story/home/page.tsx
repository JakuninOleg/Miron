import { StoryHome } from "@/components/story-home";

export const dynamic = "force-dynamic";

export default function StoryHomePage() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return <StoryHome today={today} />;
}

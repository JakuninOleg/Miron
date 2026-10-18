import { ProgressScreen } from "@/components/progress-screen";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { section } = await searchParams;
  return <ProgressScreen initialSection={section === "story" ? "story" : "xp"} />;
}

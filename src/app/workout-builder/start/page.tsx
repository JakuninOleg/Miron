import { SavedWorkoutStartScreen } from "@/components/workout-builder/saved-workout-start";
import { savedSourceInput } from "@/server/domain/workout-sources";
import { notFound } from "next/navigation";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; id?: string; save?: string }>;
}) {
  const query = await searchParams;
  const input = savedSourceInput.safeParse({ source: query.source, id: query.id });
  if (!input.success) notFound();
  return (
    <SavedWorkoutStartScreen
      key={`${input.data.source}:${input.data.id}`}
      source={input.data}
      initialSave={query.save === "1"}
    />
  );
}

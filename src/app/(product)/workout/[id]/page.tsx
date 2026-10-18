import { z } from "zod";
import { notFound } from "next/navigation";
import { WorkoutHistoryReview } from "@/components/workout-history-review";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return <WorkoutHistoryReview key={id} id={id} />;
}

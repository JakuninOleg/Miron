import { ProductOnboarding } from "@/components/product-home";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ replay?: string; next?: string }>;
}) {
  const query = await searchParams;
  return (
    <ProductOnboarding
      replay={process.env.NODE_ENV !== "production" && query.replay === "1"}
      next={query.next === "/workout-builder" ? "/workout-builder" : "/dashboard"}
    />
  );
}

import { ProductDashboard } from "@/components/product-home";
import { connection } from "next/server";

export default async function Page() {
  await connection();
  return (
    <ProductDashboard
      today={new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Moscow",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date())}
      allowReplay={process.env.NODE_ENV !== "production"}
    />
  );
}

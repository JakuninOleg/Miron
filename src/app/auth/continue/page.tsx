import { AccountEntry } from "@/components/account-entry";
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const query = await searchParams;
  return <AccountEntry next={query.next} />;
}

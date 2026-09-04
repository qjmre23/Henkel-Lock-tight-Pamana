import RepairFlow from "@/components/repair/RepairFlow";

export default async function RepairPage({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string }>;
}) {
  const sp = await searchParams;
  return <RepairFlow initialScreen={sp.screen} />;
}

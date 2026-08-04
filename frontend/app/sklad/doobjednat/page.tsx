import { apiRead } from "@/lib/api";
import { getKontext } from "@/lib/kontext";
import SkladView, { type SkladData } from "@/components/SkladView";

export default async function SkladDoobjednatPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.q) params.set("q", sp.q);

  const [data, ctx] = await Promise.all([
    apiRead<SkladData>(`/sklad/doobjednat?${params.toString()}`),
    getKontext(),
  ]);
  const canManage = !!ctx.user && ["admin", "storekeeper"].includes(ctx.user.role);

  return <SkladView data={data} canManage={canManage} />;
}

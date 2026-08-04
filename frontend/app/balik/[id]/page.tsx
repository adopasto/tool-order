import Link from "next/link";
import { apiRead } from "@/lib/api";
import { getKontext } from "@/lib/kontext";
import Mini from "@/components/Mini";
import AddToCartForm from "@/components/AddToCartForm";
import type { Stav } from "@/lib/types";

type Komponent = {
  id: number; code: string; name: string; unit: string; stock_qty: number;
  reorder_point: number; image_path: string | null; qty: number; stav: Stav;
};
type BalikDetail = {
  id: number; code: string | null; name: string; description: string | null;
  cat_name: string | null; active: number; komponenty: Komponent[]; dostupnost: number;
};

export default async function BalikPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ b }, ctx] = await Promise.all([
    apiRead<{ b: BalikDetail }>(`/balik/${id}`),
    getKontext(),
  ]);
  const canManage = !!ctx.user && ["admin", "storekeeper"].includes(ctx.user.role);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div className="eyebrow">Balík{b.cat_name ? ` · ${b.cat_name}` : ""}</div>
          <h1>{b.name}</h1>
          <div className="mono" style={{ color: "var(--steel)", fontSize: 13 }}>{b.code || ""}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canManage && <Link className="btn sec" href={`/sprava/balik/${b.id}`}>Upraviť</Link>}
          <Link className="btn sec" href="/katalog?typ=baliky">Späť na balíky</Link>
        </div>
      </div>

      {b.description && (
        <div className="panel" style={{ marginBottom: 16 }}><div className="panel-b">
          <p style={{ margin: 0 }}>{b.description}</p>
        </div></div>
      )}

      <div className="panel">
        <div className="panel-h">Obsah balíka</div>
        <table className="tbl">
          <thead><tr>
            <th style={{ width: 56 }}></th><th style={{ width: 96 }}>Kód</th><th>Položka</th>
            <th className="num" style={{ width: 90 }}>V balíku</th>
            <th className="num" style={{ width: 100 }}>Na sklade</th><th style={{ width: 120 }}>Stav</th>
          </tr></thead>
          <tbody>
            {b.komponenty.map((k) => (
              <tr key={k.id}>
                <td><Mini path={k.image_path} kod={k.code} /></td>
                <td className="mono"><Link href={`/produkt/${k.id}`}>{k.code}</Link></td>
                <td>{k.name}</td>
                <td className="num">{k.qty} {k.unit}</td>
                <td className="num">{k.stock_qty}</td>
                <td><span className={`tag ${k.stav}`}>
                  {k.stav === "ok" ? "v poriadku" : k.stav === "nizka" ? "nízka" : "vypredané"}
                </span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="binlabel">
          <div className="row">
            <span className="qty">{b.dostupnost}<small>kompletných sád na sklade</small></span>
            <span className={`tag ${b.dostupnost > 0 ? "ok" : "nula"}`}>
              {b.dostupnost > 0 ? "dostupné" : "nekompletné"}
            </span>
          </div>
          <div className="gauge-legend">balík sa pri odoslaní žiadanky rozloží na jednotlivé položky</div>
        </div>
        {!!b.active && <AddToCartForm kind="bundle" id={b.id} ariaLabel="Počet sád" />}
      </div>
    </>
  );
}

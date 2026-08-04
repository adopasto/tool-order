import Link from "next/link";
import { apiRead } from "@/lib/api";
import Mini from "@/components/Mini";

type NizkaZasobaPolozka = {
  item_id: number; code: string; name: string; unit: string; stock_qty: number;
  reorder_point: number; reorder_qty: number | null; location: string | null; image_path: string | null;
  supplier_name: string | null; supplier_sku: string | null; lead_time_days: number | null;
};
type ZiadankaNaSchvalenie = { id: number; number: string; cost_center: string | null; created_at: string; ziadatel: string };
type Aktivita = {
  created_at: string; move_type: string; qty: number; item_id: number; code: string; name: string;
  unit: string; full_name: string | null;
};

type PrehladData = {
  nizkaZasoba: { pocet: number; polozky: NizkaZasobaPolozka[] };
  naSchvalenie: { pocet: number; ziadanky: ZiadankaNaSchvalenie[] };
  aktivita: Aktivita[];
};

export default async function PrehladPage() {
  const data = await apiRead<PrehladData>("/prehlad");
  const { nizkaZasoba, naSchvalenie, aktivita } = data;

  return (
    <>
      <h1>Prehľad</h1>
      <p className="sub">Kľúčové čísla na jednom mieste.</p>

      <div className="dlazdice">
        <Link className="dlazdica" href="/sklad/doobjednat">
          <div className="eyebrow">Sklad</div>
          <div className="dl-nadpis">Nízka zásoba</div>
          <div className="dl-cislo">{nizkaZasoba.pocet}</div>
          <div className="dl-popis">položiek na signálnej zásobe alebo pod ňou</div>
        </Link>
        <Link className="dlazdica" href="/ziadanky?stav=NOVA">
          <div className="eyebrow">Žiadanky</div>
          <div className="dl-nadpis">Na schválenie</div>
          <div className="dl-cislo">{naSchvalenie.pocet}</div>
          <div className="dl-popis">čaká na rozhodnutie schvaľovateľa</div>
        </Link>
        <Link className="dlazdica" href="/sklad?tab=pohyby">
          <div className="eyebrow">Sklad</div>
          <div className="dl-nadpis">Posledná aktivita</div>
          <div className="dl-cislo">{aktivita.length}</div>
          <div className="dl-popis">posledných pohybov na sklade</div>
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 22, alignItems: "start" }}>
        <div className="panel">
          <div className="panel-h">Položky pod signálnou zásobou</div>
          {nizkaZasoba.polozky.length === 0 ? (
            <div className="panel-b" style={{ color: "var(--steel)" }}>Všetko je nad signálnou zásobou.</div>
          ) : (
            <table className="tbl">
              <tbody>
                {nizkaZasoba.polozky.map((p) => (
                  <tr key={p.item_id}>
                    <td style={{ width: 56 }}><Link href={`/produkt/${p.item_id}`}><Mini path={p.image_path} kod={p.code} /></Link></td>
                    <td className="mono"><Link href={`/produkt/${p.item_id}`}>{p.code}</Link></td>
                    <td><Link className="odkaz-ink" href={`/produkt/${p.item_id}`}>{p.name}</Link></td>
                    <td className="num" style={{ color: p.stock_qty <= 0 ? "var(--zero)" : "var(--low)" }}>
                      <b>{p.stock_qty}</b> {p.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {nizkaZasoba.pocet > nizkaZasoba.polozky.length && (
            <div className="panel-b" style={{ borderTop: "1px solid var(--line)" }}>
              <Link href="/sklad/doobjednat">Zobraziť všetky ({nizkaZasoba.pocet}) →</Link>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-h">Žiadanky čakajúce na schválenie</div>
          {naSchvalenie.ziadanky.length === 0 ? (
            <div className="panel-b" style={{ color: "var(--steel)" }}>Žiadne žiadanky nečakajú na schválenie.</div>
          ) : (
            <table className="tbl">
              <tbody>
                {naSchvalenie.ziadanky.map((z) => (
                  <tr key={z.id}>
                    <td className="mono"><Link href={`/ziadanky/${z.id}`}>{z.number}</Link></td>
                    <td>{z.ziadatel}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{z.cost_center || "—"}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{z.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {naSchvalenie.pocet > naSchvalenie.ziadanky.length && (
            <div className="panel-b" style={{ borderTop: "1px solid var(--line)" }}>
              <Link href="/ziadanky?stav=NOVA">Zobraziť všetky ({naSchvalenie.pocet}) →</Link>
            </div>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-h">Posledná aktivita</div>
        {aktivita.length === 0 ? (
          <div className="panel-b" style={{ color: "var(--steel)" }}>Zatiaľ žiadne pohyby.</div>
        ) : (
          <table className="tbl">
            <thead><tr>
              <th style={{ width: 150 }}>Čas</th><th style={{ width: 96 }}>Kód</th><th>Položka</th>
              <th style={{ width: 100 }}>Typ</th><th className="num" style={{ width: 90 }}>Množstvo</th>
              <th style={{ width: 150 }}>Kto</th>
            </tr></thead>
            <tbody>
              {aktivita.map((m, idx) => (
                <tr key={idx}>
                  <td className="mono" style={{ fontSize: 12 }}>{m.created_at}</td>
                  <td className="mono"><Link href={`/produkt/${m.item_id}`}>{m.code}</Link></td>
                  <td>{m.name}</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{m.move_type}</td>
                  <td className="num" style={{ color: m.qty < 0 ? "var(--zero)" : "var(--ok)" }}>
                    {m.qty > 0 ? "+" : ""}{m.qty} {m.unit}
                  </td>
                  <td style={{ fontSize: 13 }}>{m.full_name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="panel-b" style={{ borderTop: "1px solid var(--line)" }}>
          <Link href="/sklad?tab=pohyby">Zobraziť všetky pohyby →</Link>
        </div>
      </div>
    </>
  );
}

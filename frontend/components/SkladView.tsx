import Link from "next/link";
import Mini from "./Mini";
import { correctStockAction, receiveStockAction, sendReorderSummaryAction } from "@/lib/actions";
import type { Stav } from "@/lib/types";

type Polozka = {
  id: number; code: string; name: string; cat_name: string | null; location: string | null;
  stock_qty: number; reorder_point: number; unit: string; stav: Stav; image_path: string | null;
};
type Pohyb = {
  id: number; item_id: number; code: string; name: string; unit: string; full_name: string | null;
  ziadanka: string | null; created_at: string; move_type: string; qty: number; note: string | null;
};
type Alert = {
  id: number; item_id: number; code: string; name: string; unit: string; stock_qty: number;
  reorder_point: number; reorder_qty: number | null; location: string | null; image_path: string | null;
  supplier_name: string | null; supplier_sku: string | null; lead_time_days: number | null;
};
type Dodavatel = { id: number; name: string };

export type SkladData = {
  zalozka: string; q: string; polozky: Polozka[]; pohyby: Pohyb[]; alerty: Alert[]; dodavatelia: Dodavatel[];
};

export default function SkladView({ data, canManage }: { data: SkladData; canManage: boolean }) {
  const { zalozka, q, polozky, pohyby, alerty, dodavatelia } = data;

  return (
    <>
      <div className="hlavicka">
        <div>
          <h1>Sklad</h1>
          <p className="sub">Stav sa mení len pohybmi – príjmom, výdajom alebo inventúrou. Nikdy sa neprepisuje ručne.</p>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <Link href="/sklad" className={zalozka === "stav" ? "active" : ""}>Stav zásob</Link>
        <Link href="/sklad/doobjednat" className={zalozka === "doobjednat" ? "active" : ""}>
          Doobjednať{alerty.length > 0 && zalozka !== "doobjednat" ? ` (${alerty.length})` : ""}
        </Link>
        {canManage && (
          <>
            <Link href="/sklad?tab=prijem" className={zalozka === "prijem" ? "active" : ""}>Príjem</Link>
            <Link href="/sklad?tab=inventura" className={zalozka === "inventura" ? "active" : ""}>Inventúra</Link>
          </>
        )}
        <Link href="/sklad?tab=pohyby" className={zalozka === "pohyby" ? "active" : ""}>Pohyby</Link>
      </div>

      {zalozka === "stav" && (
        <>
          <form className="toolbar" method="get" action="/sklad">
            <div className="grow"><input type="search" name="q" defaultValue={q} placeholder="Hľadať podľa kódu, názvu alebo regálu" /></div>
            <button className="btn sec" type="submit">Hľadať</button>
            {q && <Link className="btn sec" href="/sklad">Zrušiť</Link>}
          </form>
          <div className="panel">
            <table className="tbl">
              <thead><tr>
                <th style={{ width: 56 }}></th><th style={{ width: 96 }}>Kód</th><th>Položka</th>
                <th style={{ width: 130 }}>Kategória</th><th style={{ width: 70 }}>Regál</th>
                <th className="num" style={{ width: 110 }}>Na sklade</th><th className="num" style={{ width: 90 }}>Signálna</th>
                <th style={{ width: 110 }}>Stav</th>
              </tr></thead>
              <tbody>
                {polozky.map((p) => (
                  <tr key={p.id}>
                    <td><Link href={`/produkt/${p.id}`}><Mini path={p.image_path} kod={p.code} /></Link></td>
                    <td className="mono"><Link href={`/produkt/${p.id}`}>{p.code}</Link></td>
                    <td><Link className="odkaz-ink" href={`/produkt/${p.id}`}>{p.name}</Link></td>
                    <td style={{ color: "var(--steel)", fontSize: 13 }}>{p.cat_name || "—"}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{p.location || "—"}</td>
                    <td className="num"><b>{p.stock_qty}</b> {p.unit}</td>
                    <td className="num" style={{ color: "var(--steel)" }}>{p.reorder_point}</td>
                    <td><span className={`tag ${p.stav}`}>
                      {p.stav === "ok" ? "v poriadku" : p.stav === "nizka" ? "nízka" : "vypredané"}
                    </span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {zalozka === "doobjednat" && (
        <>
          <div className="hlavicka" style={{ marginBottom: 12 }}>
            <p className="sub" style={{ maxWidth: 640, margin: 0 }}>
              Položky na signálnej zásobe alebo pod ňou. Zoznam vzniká automaticky pri výdaji a zatvorí sa sám,
              keď príjem stav zdvihne. Objednávku vystavuje oddelenie nákupu.
            </p>
            {alerty.length > 0 && (
              <div style={{ display: "flex", gap: 8 }}>
                <a className="btn sec" href="/api/sklad/doobjednat/export.csv">Stiahnuť CSV</a>
                <form action={sendReorderSummaryAction}><button className="btn" type="submit">Poslať e-mailom</button></form>
              </div>
            )}
          </div>
          {alerty.length === 0 ? (
            <div className="empty">Všetko je nad signálnou zásobou. Netreba nič doobjednávať.</div>
          ) : (
            <div className="panel">
              <table className="tbl">
                <thead><tr>
                  <th style={{ width: 56 }}></th><th style={{ width: 96 }}>Kód</th><th>Položka</th>
                  <th style={{ width: 70 }}>Regál</th><th className="num" style={{ width: 100 }}>Na sklade</th>
                  <th className="num" style={{ width: 90 }}>Signálna</th><th className="num" style={{ width: 100 }}>Doobjednať</th>
                  <th style={{ width: 190 }}>Obvyklý dodávateľ</th>
                </tr></thead>
                <tbody>
                  {alerty.map((a) => (
                    <tr key={a.id}>
                      <td><Link href={`/produkt/${a.item_id}`}><Mini path={a.image_path} kod={a.code} /></Link></td>
                      <td className="mono"><Link href={`/produkt/${a.item_id}`}>{a.code}</Link></td>
                      <td><Link className="odkaz-ink" href={`/produkt/${a.item_id}`}>{a.name}</Link></td>
                      <td className="mono" style={{ fontSize: 12 }}>{a.location || "—"}</td>
                      <td className="num" style={{ color: a.stock_qty <= 0 ? "var(--zero)" : "var(--low)" }}>
                        <b>{a.stock_qty}</b> {a.unit}
                      </td>
                      <td className="num" style={{ color: "var(--steel)" }}>{a.reorder_point}</td>
                      <td className="num"><b>{a.reorder_qty ?? "—"}</b></td>
                      <td style={{ fontSize: 13 }}>
                        {a.supplier_name || "—"}
                        {a.supplier_sku && (
                          <div className="mono" style={{ fontSize: 11.5, color: "var(--steel)" }}>
                            {a.supplier_sku} · ~{a.lead_time_days} dní
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {zalozka === "prijem" && (
        <div className="panel" style={{ maxWidth: 620 }}>
          <div className="panel-h">Príjem na sklad</div>
          <div className="panel-b">
            <form action={receiveStockAction}>
              <div className="field">
                <label htmlFor="p_item">Položka</label>
                <select id="p_item" name="item_id" required>
                  {polozky.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} – {p.name} ({p.stock_qty} {p.unit})</option>
                  ))}
                </select>
              </div>
              <div className="formrow">
                <div className="field"><label htmlFor="p_qty">Prijaté množstvo</label>
                  <input type="number" id="p_qty" name="qty" min={0.001} step="any" defaultValue={1} required /></div>
                <div className="field"><label htmlFor="p_sup">Dodávateľ</label>
                  <select id="p_sup" name="supplier_id" defaultValue="">
                    <option value="">—</option>
                    {dodavatelia.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select></div>
              </div>
              <div className="field"><label htmlFor="p_note">Doklad / poznámka</label>
                <input type="text" id="p_note" name="note" placeholder="Dodací list 2026/1187" /></div>
              <button className="btn" type="submit">Zaevidovať príjem</button>
            </form>
          </div>
        </div>
      )}

      {zalozka === "inventura" && (
        <div className="panel" style={{ maxWidth: 620 }}>
          <div className="panel-h">Inventúra / oprava stavu</div>
          <div className="panel-b">
            <form action={correctStockAction}>
              <div className="field">
                <label htmlFor="k_item">Položka</label>
                <select id="k_item" name="item_id" required>
                  {polozky.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} – {p.name} ({p.stock_qty} {p.unit})</option>
                  ))}
                </select>
              </div>
              <div className="formrow">
                <div className="field"><label htmlFor="k_qty">Zistený skutočný stav</label>
                  <input type="number" id="k_qty" name="new_qty" min={0} step="any" defaultValue={0} required /></div>
                <div className="field"><label htmlFor="k_typ">Typ zápisu</label>
                  <select id="k_typ" name="typ" defaultValue="INVENTURA">
                    <option value="INVENTURA">Inventúra</option>
                    <option value="KOREKCIA">Korekcia</option>
                  </select></div>
              </div>
              <div className="field"><label htmlFor="k_note">Poznámka</label>
                <input type="text" id="k_note" name="note" placeholder="Inventúra 06/2026" /></div>
              <button className="btn" type="submit">Zapísať rozdiel</button>
              <div style={{ fontSize: 12, color: "var(--steel)", marginTop: 10 }}>
                Zapíše sa rozdiel oproti aktuálnemu stavu, nie nová hodnota – história zostane úplná.
              </div>
            </form>
          </div>
        </div>
      )}

      {zalozka === "pohyby" && (
        <div className="panel">
          <table className="tbl">
            <thead><tr>
              <th style={{ width: 150 }}>Čas</th><th style={{ width: 96 }}>Kód</th><th>Položka</th>
              <th style={{ width: 100 }}>Typ</th><th className="num" style={{ width: 90 }}>Množstvo</th>
              <th style={{ width: 150 }}>Kto</th><th>Poznámka</th>
            </tr></thead>
            <tbody>
              {pohyby.map((m) => (
                <tr key={m.id}>
                  <td className="mono" style={{ fontSize: 12 }}>{m.created_at}</td>
                  <td className="mono"><Link href={`/produkt/${m.item_id}`}>{m.code}</Link></td>
                  <td>{m.name}</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{m.move_type}</td>
                  <td className="num" style={{ color: m.qty < 0 ? "var(--zero)" : "var(--ok)" }}>
                    {m.qty > 0 ? "+" : ""}{m.qty} {m.unit}
                  </td>
                  <td style={{ fontSize: 13 }}>{m.full_name || "—"}</td>
                  <td style={{ fontSize: 12.5, color: "var(--steel)" }}>{m.note || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

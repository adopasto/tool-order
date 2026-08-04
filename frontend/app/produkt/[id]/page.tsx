import Link from "next/link";
import { apiRead } from "@/lib/api";
import { getKontext } from "@/lib/kontext";
import Breadcrumbs from "@/components/Breadcrumbs";
import BinLabel from "@/components/BinLabel";
import AddToCartForm from "@/components/AddToCartForm";
import { receiveStockAction } from "@/lib/actions";
import type { Stav } from "@/lib/types";

type Dodavatel = {
  id: number; name: string; email: string | null; phone: string | null; contact_person: string | null;
  lead_time_days: number; supplier_sku: string | null; price: number | null; min_order_qty: number; is_primary: number;
};
type Balik = { id: number; code: string | null; name: string; qty: number };
type Pohyb = { move_type: string; qty: number; created_at: string; note: string | null; full_name: string | null; ziadanka: string | null };
type Pasmo = { min_qty: number; unit_price: number | null; note: string | null; supplier_sku: string | null; number: string; valid_until: string | null; supplier_name: string | null };
type Ponuka = { id: number; number: string; issued_at: string | null; valid_until: string | null; file_path: string | null; supplier_name: string | null };

type ProduktDetail = {
  id: number; code: string; name: string; description: string | null;
  category_id: number | null; cat_name: string | null;
  unit: string; stock_qty: number; reorder_point: number; reorder_qty: number | null;
  location: string | null; is_esd: number; image_path: string | null; active: number;
  usage_6m: number | null; ref_price: number | null; ref_price_note: string | null;
  dodavatelia: Dodavatel[]; baliky: Balik[]; pohyby: Pohyb[];
  spotreba90: number; pasma: Pasmo[]; ponuky: Ponuka[];
  stav: Stav;
};

export default async function ProduktPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ i }, ctx] = await Promise.all([
    apiRead<{ i: ProduktDetail }>(`/produkt/${id}`),
    getKontext(),
  ]);
  const canManage = !!ctx.user && ["admin", "storekeeper"].includes(ctx.user.role);
  const canSeeSignal = !!ctx.user && ["admin", "buyer"].includes(ctx.user.role);

  return (
    <>
      <Breadcrumbs items={[
        { text: "Katalóg", href: "/katalog" },
        { text: i.cat_name || "Bez kategórie", href: i.category_id ? `/katalog?cat=${i.category_id}` : "/katalog" },
        { text: i.code },
      ]} />

      <div className="hlavicka">
        <div>
          <div className="eyebrow">Karta položky{i.is_esd ? " · ESD" : ""}{!i.active ? " · NEAKTÍVNA" : ""}</div>
          <h1>{i.name}</h1>
          <div className="mono" style={{ color: "var(--steel)", fontSize: 13 }}>{i.code}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canManage && <Link className="btn" href={`/sprava/polozka/${i.id}`}>Upraviť kartu</Link>}
          <Link className="btn sec" href="/katalog">Späť do katalógu</Link>
        </div>
      </div>

      <div className="detail">
        <div>
          <div className="panel" style={{ overflow: "hidden" }}>
            <div className="foto">
              {i.image_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/foto/${encodeURIComponent(i.image_path)}`} alt={i.name} />
              ) : (
                <div className="foto-nic"><span>{i.code}</span>bez fotky</div>
              )}
            </div>
            <BinLabel stockQty={i.stock_qty} unit={i.unit} reorderPoint={i.reorder_point} stav={i.stav}
              legend={canSeeSignal ? `signálna zásoba ${i.reorder_point} ${i.unit}` : undefined} />
            {i.active ? (
              <AddToCartForm kind="item" id={i.id} />
            ) : (
              <div style={{ padding: "0 13px 13px" }}><span className="tag nula">položka nie je v katalógu</span></div>
            )}
          </div>

          {canManage && (
            <div className="panel" style={{ marginTop: 16 }}>
              <div className="panel-h">Rýchla akcia</div>
              <div className="panel-b">
                <form action={receiveStockAction} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <input type="hidden" name="item_id" value={i.id} />
                  <div className="field" style={{ margin: 0, flex: 1 }}>
                    <label htmlFor="pr">Naskladniť</label>
                    <input type="number" id="pr" name="qty" defaultValue={1} min={0.001} step="any" />
                  </div>
                  <button className="btn sec" type="submit">Príjem</button>
                </form>
              </div>
            </div>
          )}
        </div>

        <div>
          {i.description && (
            <div className="panel" style={{ marginBottom: 16 }}><div className="panel-b">
              <p style={{ margin: 0 }}>{i.description}</p>
            </div></div>
          )}

          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-h">Údaje</div>
            <div className="panel-b">
              <dl className="kv">
                <dt>Kód</dt><dd className="mono">{i.code}</dd>
                <dt>Kategória</dt><dd>{i.cat_name || "—"}</dd>
                <dt>Umiestnenie</dt><dd className="mono">{i.location || "—"}</dd>
                <dt>Merná jednotka</dt><dd>{i.unit}</dd>
                {canSeeSignal && <><dt>Signálna zásoba</dt><dd>{i.reorder_point} {i.unit}</dd></>}
                <dt>Doobjednať po</dt><dd>{i.reorder_qty ?? "—"} {i.unit}</dd>
                <dt>ESD</dt><dd>{i.is_esd ? "áno – vyžaduje ESD manipuláciu" : "nie"}</dd>
                {i.ref_price != null && (
                  <>
                    <dt>Orientačná cena</dt>
                    <dd>{i.ref_price.toFixed(2)} € / {i.unit}
                      {i.ref_price_note && <span className="napoveda" style={{ display: "inline" }}> · {i.ref_price_note}</span>}
                    </dd>
                  </>
                )}
                {i.usage_6m != null && (
                  <>
                    <dt>Spotreba 6 mes.</dt>
                    <dd>{i.usage_6m} {i.unit} <span className="napoveda" style={{ display: "inline" }}>podľa importovaného prehľadu</span></dd>
                  </>
                )}
                <dt>Výdaj za 90 dní</dt>
                <dd>{i.spotreba90} {i.unit}
                  {i.spotreba90 > 0 && <span style={{ color: "var(--steel)", fontSize: 12 }}> (~{(i.spotreba90 / 3).toFixed(1)} mesačne)</span>}
                </dd>
              </dl>
            </div>
          </div>

          {i.baliky.length > 0 && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-h">Súčasť balíkov</div>
              <table className="tbl">
                <tbody>
                  {i.baliky.map((b) => (
                    <tr key={b.id}>
                      <td className="mono" style={{ width: 90 }}>{b.code || "—"}</td>
                      <td><Link href={`/balik/${b.id}`}>{b.name}</Link></td>
                      <td className="num" style={{ width: 80 }}>{b.qty} {i.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {i.pasma.length > 0 && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-h">Množstevné ceny z ponúk</div>
              <table className="tbl">
                <thead><tr>
                  <th style={{ width: 120 }}>Od množstva</th><th className="num" style={{ width: 100 }}>Cena/MJ</th>
                  <th>Platí pre</th><th style={{ width: 150 }}>Ponuka</th>
                </tr></thead>
                <tbody>
                  {i.pasma.map((t, idx) => (
                    <tr key={idx}>
                      <td className="mono">{t.min_qty} {i.unit}</td>
                      <td className="num"><b>{t.unit_price != null ? `${t.unit_price.toFixed(2)} €` : "—"}</b></td>
                      <td style={{ fontSize: 12.5, color: "var(--steel)" }}>{t.note || ""}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{t.number}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="panel-b" style={{ borderTop: "1px solid var(--line)" }}>
                {i.ponuky.map((q) => (
                  <div key={q.id} style={{ fontSize: 13, marginBottom: 4 }}>
                    {q.supplier_name || "—"} · ponuka <span className="mono">{q.number}</span>
                    {q.valid_until && <span className="napoveda" style={{ display: "inline" }}> platná do {q.valid_until}</span>}
                    {q.file_path && <> · <a href={`/api/ponuka/${q.id}/priloha`}>stiahnuť PDF</a></>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-h">Dodávatelia (referenčne)</div>
            <table className="tbl">
              <tbody>
                {i.dodavatelia.length === 0 && (
                  <tr><td style={{ color: "var(--steel)" }}>Položka nemá priradeného dodávateľa.</td></tr>
                )}
                {i.dodavatelia.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/dodavatelia/${d.id}`}>{d.name}</Link>
                      {!!d.is_primary && <> <span className="tag ok">hlavný</span></>}
                      <div style={{ fontSize: 12, color: "var(--steel)" }}>
                        {d.contact_person || ""}{d.phone ? ` · ${d.phone}` : ""} · dodanie ~{d.lead_time_days} dní
                      </div>
                    </td>
                    <td className="mono" style={{ width: 110, fontSize: 12 }}>{d.supplier_sku || "—"}</td>
                    <td className="num" style={{ width: 90 }}>{d.price != null ? `${d.price.toFixed(2)} €` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="panel-h">História pohybov</div>
            <table className="tbl">
              <thead><tr>
                <th style={{ width: 150 }}>Čas</th><th style={{ width: 100 }}>Typ</th>
                <th className="num" style={{ width: 90 }}>Množstvo</th><th style={{ width: 130 }}>Doklad</th>
                <th>Kto</th>
              </tr></thead>
              <tbody>
                {i.pohyby.length === 0 && (
                  <tr><td colSpan={5} style={{ color: "var(--steel)" }}>Zatiaľ bez pohybov.</td></tr>
                )}
                {i.pohyby.map((m, idx) => (
                  <tr key={idx}>
                    <td className="mono" style={{ fontSize: 12 }}>{m.created_at}</td>
                    <td className="mono" style={{ fontSize: 11.5 }}>{m.move_type}</td>
                    <td className="num" style={{ color: m.qty < 0 ? "var(--zero)" : "var(--ok)" }}>
                      {m.qty > 0 ? "+" : ""}{m.qty} {i.unit}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{m.ziadanka || ""}</td>
                    <td style={{ fontSize: 13 }}>
                      {m.full_name || "—"}
                      {m.note && <div style={{ fontSize: 11.5, color: "var(--steel)" }}>{m.note}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

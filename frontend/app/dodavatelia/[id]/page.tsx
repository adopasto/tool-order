import Link from "next/link";
import { apiRead } from "@/lib/api";
import type { Stav } from "@/lib/types";

type DodavatelDetail = {
  id: number; name: string; contact_person: string | null; email: string | null; phone: string | null;
  web: string | null; address: string | null; ico: string | null; lead_time_days: number; note: string | null;
};
type Polozka = {
  id: number; code: string; name: string; supplier_sku: string | null; price: number | null;
  min_order_qty: number; is_primary: number; stock_qty: number; unit: string; stav: Stav;
};
type Ponuka = {
  id: number; number: string; issued_at: string | null; valid_until: string | null;
  total_no_vat: number | null; riadkov: number; note: string | null; file_path: string | null;
};

export default async function DodavatelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { d, polozky, ponuky } = await apiRead<{ d: DodavatelDetail; polozky: Polozka[]; ponuky: Ponuka[] }>(`/dodavatelia/${id}`);

  return (
    <>
      <div className="eyebrow">Dodávateľ</div>
      <h1>{d.name}</h1>

      <div className="panel" style={{ margin: "14px 0 22px" }}>
        <div className="panel-b">
          <dl className="kv">
            <dt>Kontaktná osoba</dt><dd>{d.contact_person || "—"}</dd>
            <dt>E-mail</dt><dd>{d.email ? <a href={`mailto:${d.email}`}>{d.email}</a> : "—"}</dd>
            <dt>Telefón</dt><dd className="mono">{d.phone || "—"}</dd>
            <dt>Web</dt><dd>{d.web || "—"}</dd>
            <dt>Adresa</dt><dd>{d.address || "—"}</dd>
            <dt>IČO</dt><dd className="mono">{d.ico || "—"}</dd>
            <dt>Dodacia lehota</dt><dd>{d.lead_time_days} dní</dd>
            {d.note && <><dt>Poznámka</dt><dd>{d.note}</dd></>}
          </dl>
        </div>
      </div>

      {ponuky.length > 0 && (
        <>
          <h2>Cenové ponuky</h2>
          <div className="panel" style={{ marginBottom: 22 }}>
            <table className="tbl">
              <thead><tr>
                <th style={{ width: 130 }}>Číslo</th><th style={{ width: 120 }}>Vystavená</th>
                <th style={{ width: 120 }}>Platná do</th><th className="num" style={{ width: 110 }}>Bez DPH</th>
                <th className="num" style={{ width: 90 }}>Riadkov</th><th>Poznámka</th>
                <th style={{ width: 110 }}></th>
              </tr></thead>
              <tbody>
                {ponuky.map((q) => (
                  <tr key={q.id}>
                    <td className="mono">{q.number}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{q.issued_at || "—"}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{q.valid_until || "—"}</td>
                    <td className="num">{q.total_no_vat != null ? `${q.total_no_vat.toFixed(2)} €` : "—"}</td>
                    <td className="num">{q.riadkov}</td>
                    <td style={{ fontSize: 12.5, color: "var(--steel)" }}>{q.note || ""}</td>
                    <td>{q.file_path && <a className="btn sec sm" href={`/api/ponuka/${q.id}/priloha`}>PDF</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Dodávané položky</h2>
      <div className="panel">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 96 }}>Kód</th><th>Položka</th><th style={{ width: 110 }}>Kat. č. dod.</th>
              <th className="num" style={{ width: 90 }}>Cena</th><th className="num" style={{ width: 80 }}>Min. obj.</th>
              <th className="num" style={{ width: 100 }}>Na sklade</th><th style={{ width: 110 }}>Stav</th>
            </tr>
          </thead>
          <tbody>
            {polozky.map((p) => (
              <tr key={p.id}>
                <td className="mono">{p.code}</td>
                <td>{p.name}{p.is_primary ? " · hlavný dodávateľ" : ""}</td>
                <td className="mono">{p.supplier_sku || "—"}</td>
                <td className="num">{p.price != null ? `${p.price.toFixed(2)} €` : "—"}</td>
                <td className="num">{p.min_order_qty}</td>
                <td className="num">{p.stock_qty} {p.unit}</td>
                <td><span className={`tag ${p.stav}`}>
                  {p.stav === "ok" ? "v poriadku" : p.stav === "nizka" ? "nízka" : "vypredané"}
                </span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 24 }}><Link href="/dodavatelia">← Späť na zoznam</Link></p>
    </>
  );
}

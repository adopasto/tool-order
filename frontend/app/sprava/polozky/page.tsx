import Link from "next/link";
import { apiRead } from "@/lib/api";
import Breadcrumbs from "@/components/Breadcrumbs";
import Mini from "@/components/Mini";
import type { Item } from "@/lib/types";

export default async function SpravaPolozkyPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { polozky } = await apiRead<{ polozky: Item[] }>(`/sprava/polozky${q ? `?q=${encodeURIComponent(q)}` : ""}`);

  return (
    <>
      <Breadcrumbs items={[{ text: "Správa", href: "/sprava" }, { text: "Položky" }]} />

      <div className="hlavicka">
        <div>
          <h1>Položky</h1>
          <p className="sub">Kliknutím na riadok otvoríš úpravu. Nové položky pribúdajú tlačidlom vpravo.</p>
        </div>
        <Link className="btn" href="/sprava/polozka/nova">+ Nová položka</Link>
      </div>

      <form className="toolbar" method="get" action="/sprava/polozky">
        <div className="grow"><input type="search" name="q" defaultValue={q || ""} placeholder="Hľadať podľa kódu alebo názvu" /></div>
        <button className="btn sec" type="submit">Hľadať</button>
        {q && <Link className="btn sec" href="/sprava/polozky">Zrušiť</Link>}
      </form>

      {polozky.length === 0 ? (
        <div className="empty">Žiadna položka nezodpovedá filtru.<br />
          <Link className="btn sm" style={{ marginTop: 12 }} href="/sprava/polozka/nova">Založiť novú položku</Link>
        </div>
      ) : (
        <div className="panel">
          <table className="tbl">
            <thead><tr>
              <th style={{ width: 56 }}>Foto</th><th style={{ width: 100 }}>Kód</th><th>Názov</th>
              <th style={{ width: 130 }}>Kategória</th><th style={{ width: 70 }}>Regál</th>
              <th className="num" style={{ width: 100 }}>Na sklade</th><th className="num" style={{ width: 80 }}>Signálna</th>
              <th style={{ width: 110 }}>Stav</th><th style={{ width: 150 }}></th>
            </tr></thead>
            <tbody>
              {polozky.map((p) => (
                <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
                  <td><Link href={`/sprava/polozka/${p.id}`}><Mini path={p.image_path} kod={p.code} /></Link></td>
                  <td className="mono"><Link href={`/sprava/polozka/${p.id}`}>{p.code}</Link></td>
                  <td>
                    <Link className="odkaz-ink" href={`/sprava/polozka/${p.id}`}>{p.name}</Link>
                    {!p.active ? " · neaktívna" : ""}{p.is_esd ? " · ESD" : ""}
                  </td>
                  <td style={{ color: "var(--steel)", fontSize: 13 }}>{p.cat_name || "—"}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{p.location || "—"}</td>
                  <td className="num"><b>{p.stock_qty}</b> {p.unit}</td>
                  <td className="num" style={{ color: "var(--steel)" }}>{p.reorder_point}</td>
                  <td><span className={`tag ${p.stav}`}>
                    {p.stav === "ok" ? "v poriadku" : p.stav === "nizka" ? "nízka" : "vypredané"}
                  </span></td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <Link className="btn sec sm" href={`/sprava/polozka/${p.id}`}>Upraviť</Link>
                    <Link className="btn sec sm" href={`/produkt/${p.id}`}>Karta</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

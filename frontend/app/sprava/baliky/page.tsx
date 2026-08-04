import Link from "next/link";
import { apiRead } from "@/lib/api";
import Breadcrumbs from "@/components/Breadcrumbs";

type BalikRow = { id: number; code: string | null; name: string; cat_name: string | null; pocet: number; active: number };

export default async function SpravaBalikyPage() {
  const { baliky } = await apiRead<{ baliky: BalikRow[] }>("/sprava/baliky");

  return (
    <>
      <Breadcrumbs items={[{ text: "Správa", href: "/sprava" }, { text: "Balíky" }]} />

      <div className="hlavicka">
        <div>
          <h1>Balíky</h1>
          <p className="sub">Balík je predpis, nie skladová položka. Pri odoslaní žiadanky sa rozloží na jednotlivé kusy.</p>
        </div>
        <Link className="btn" href="/sprava/balik/novy">+ Nový balík</Link>
      </div>

      {baliky.length === 0 ? (
        <div className="empty">Zatiaľ žiadne balíky.<br />
          <Link className="btn sm" style={{ marginTop: 12 }} href="/sprava/balik/novy">Založiť prvý</Link>
        </div>
      ) : (
        <div className="panel">
          <table className="tbl">
            <thead><tr>
              <th style={{ width: 110 }}>Kód</th><th>Názov</th><th style={{ width: 160 }}>Kategória</th>
              <th className="num" style={{ width: 90 }}>Položiek</th><th style={{ width: 150 }}></th>
            </tr></thead>
            <tbody>
              {baliky.map((b) => (
                <tr key={b.id} style={{ opacity: b.active ? 1 : 0.5 }}>
                  <td className="mono"><Link href={`/sprava/balik/${b.id}`}>{b.code || "—"}</Link></td>
                  <td><Link className="odkaz-ink" href={`/sprava/balik/${b.id}`}>{b.name}</Link>{!b.active ? " · neaktívny" : ""}</td>
                  <td style={{ color: "var(--steel)", fontSize: 13 }}>{b.cat_name || "—"}</td>
                  <td className="num">{b.pocet}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <Link className="btn sec sm" href={`/sprava/balik/${b.id}`}>Upraviť</Link>
                    <Link className="btn sec sm" href={`/balik/${b.id}`}>Karta</Link>
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

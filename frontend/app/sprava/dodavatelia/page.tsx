import Link from "next/link";
import { apiRead } from "@/lib/api";
import Breadcrumbs from "@/components/Breadcrumbs";

type DodavatelRow = {
  id: number; name: string; address: string | null; ico: string | null; contact_person: string | null;
  email: string | null; phone: string | null; pocet_poloziek: number; lead_time_days: number; active: number;
};

export default async function SpravaDodavateliaPage() {
  const { dodavatelia } = await apiRead<{ dodavatelia: DodavatelRow[] }>("/sprava/dodavatelia");

  return (
    <>
      <Breadcrumbs items={[{ text: "Správa", href: "/sprava" }, { text: "Dodávatelia" }]} />

      <div className="hlavicka">
        <div>
          <h1>Dodávatelia</h1>
          <p className="sub">Evidencia kontaktov a rozsahu dodávok. Objednávky vystavuje oddelenie nákupu.</p>
        </div>
        <Link className="btn" href="/sprava/dodavatel/novy">+ Nový dodávateľ</Link>
      </div>

      <div className="panel">
        <table className="tbl">
          <thead><tr>
            <th>Dodávateľ</th><th style={{ width: 170 }}>Kontakt</th><th style={{ width: 220 }}>E-mail</th>
            <th style={{ width: 140 }}>Telefón</th><th className="num" style={{ width: 90 }}>Položiek</th>
            <th style={{ width: 80 }}>Lehota</th><th style={{ width: 100 }}></th>
          </tr></thead>
          <tbody>
            {dodavatelia.map((d) => (
              <tr key={d.id} style={{ opacity: d.active ? 1 : 0.5 }}>
                <td>
                  <Link className="odkaz-ink" href={`/sprava/dodavatel/${d.id}`}><b>{d.name}</b></Link>
                  <div style={{ fontSize: 12, color: "var(--steel)" }}>{d.address || ""}{d.ico ? ` · IČO ${d.ico}` : ""}</div>
                </td>
                <td>{d.contact_person || "—"}</td>
                <td className="mono" style={{ fontSize: 12 }}>{d.email || "—"}</td>
                <td className="mono" style={{ fontSize: 12 }}>{d.phone || "—"}</td>
                <td className="num">{d.pocet_poloziek}</td>
                <td className="mono" style={{ fontSize: 12 }}>{d.lead_time_days} dní</td>
                <td><Link className="btn sec sm" href={`/sprava/dodavatel/${d.id}`}>Upraviť</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

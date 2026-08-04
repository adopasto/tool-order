import Link from "next/link";
import { apiRead } from "@/lib/api";

type Dodavatel = {
  id: number; name: string; address: string | null; ico: string | null; contact_person: string | null;
  email: string | null; phone: string | null; pocet_poloziek: number; lead_time_days: number;
};

export default async function DodavateliaPage() {
  const { dodavatelia } = await apiRead<{ dodavatelia: Dodavatel[] }>("/dodavatelia");

  return (
    <>
      <h1>Dodávatelia</h1>
      <p className="sub">Kontakty a rozsah dodávok. Kliknutím na dodávateľa zobrazíte položky, ktoré dodáva.</p>

      <div className="panel">
        <table className="tbl">
          <thead>
            <tr>
              <th>Dodávateľ</th><th style={{ width: 170 }}>Kontaktná osoba</th>
              <th style={{ width: 230 }}>E-mail</th><th style={{ width: 150 }}>Telefón</th>
              <th className="num" style={{ width: 90 }}>Položiek</th><th style={{ width: 90 }}>Lehota</th>
            </tr>
          </thead>
          <tbody>
            {dodavatelia.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link href={`/dodavatelia/${d.id}`}><b>{d.name}</b></Link>
                  <div style={{ fontSize: 12, color: "var(--steel)" }}>
                    {d.address || ""}{d.ico ? ` · IČO ${d.ico}` : ""}
                  </div>
                </td>
                <td>{d.contact_person || "—"}</td>
                <td className="mono" style={{ fontSize: 12 }}>
                  {d.email ? <a href={`mailto:${d.email}`}>{d.email}</a> : "—"}
                </td>
                <td className="mono" style={{ fontSize: 12 }}>{d.phone || "—"}</td>
                <td className="num">{d.pocet_poloziek}</td>
                <td className="mono" style={{ fontSize: 12 }}>{d.lead_time_days} dní</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

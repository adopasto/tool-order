import Link from "next/link";
import { apiRead } from "@/lib/api";
import { getKontext } from "@/lib/kontext";

const STAV_LABEL: Record<string, string> = {
  NOVA: "Čaká na schválenie", SCHVALENA: "Schválená", CAKA_NA_TOVAR: "Čaká na tovar",
  CIASTOCNE_VYDANA: "Čiastočne vydaná", VYDANA: "Vydaná",
  ZAMIETNUTA: "Zamietnutá", STORNO: "Stornovaná",
};

type Ziadanka = {
  id: number; number: string; created_at: string; ziadatel: string;
  cost_center: string | null; pocet_riadkov: number; status: string;
};

export default async function ZiadankyPage({ searchParams }: { searchParams: Promise<{ stav?: string }> }) {
  const { stav } = await searchParams;
  const [{ ziadanky }, ctx] = await Promise.all([
    apiRead<{ ziadanky: Ziadanka[] }>(`/ziadanky${stav ? `?stav=${stav}` : ""}`),
    getKontext(),
  ]);
  const role = ctx.user?.role;

  return (
    <>
      <h1>Žiadanky</h1>
      <p className="sub">
        {role === "requester" ? "Vaše odoslané žiadanky a ich stav."
          : role === "approver" ? "Žiadanky vášho strediska čakajúce na rozhodnutie."
          : "Všetky žiadanky v systéme."}
      </p>

      <div className="tabs">
        <Link href="/ziadanky" className={!stav ? "active" : ""}>Všetky</Link>
        {Object.entries(STAV_LABEL).map(([k, v]) => (
          <Link key={k} href={`/ziadanky?stav=${k}`} className={stav === k ? "active" : ""}>{v}</Link>
        ))}
      </div>

      {ziadanky.length === 0 ? (
        <div className="empty">Zatiaľ žiadne žiadanky. Vytvorte prvú v katalógu.</div>
      ) : (
        <div className="panel">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 130 }}>Číslo</th>
                <th style={{ width: 150 }}>Dátum</th>
                <th>Žiadateľ</th>
                <th style={{ width: 90 }}>Stredisko</th>
                <th className="num" style={{ width: 70 }}>Riadkov</th>
                <th style={{ width: 160 }}>Stav</th>
              </tr>
            </thead>
            <tbody>
              {ziadanky.map((z) => (
                <tr key={z.id}>
                  <td className="mono"><Link href={`/ziadanky/${z.id}`}>{z.number}</Link></td>
                  <td className="mono" style={{ fontSize: 12 }}>{z.created_at}</td>
                  <td>{z.ziadatel}</td>
                  <td className="mono">{z.cost_center || "—"}</td>
                  <td className="num">{z.pocet_riadkov}</td>
                  <td><span className={`stav ${z.status}`}>{STAV_LABEL[z.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

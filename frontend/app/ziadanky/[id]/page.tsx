import Link from "next/link";
import { apiRead } from "@/lib/api";
import { getKontext } from "@/lib/kontext";
import Mini from "@/components/Mini";
import { approveRequestAction, cancelRequestAction, issueRequestAction, rejectRequestAction } from "@/lib/actions";

const STAV_LABEL: Record<string, string> = {
  NOVA: "Čaká na schválenie", SCHVALENA: "Schválená", CAKA_NA_TOVAR: "Čaká na tovar",
  CIASTOCNE_VYDANA: "Čiastočne vydaná", VYDANA: "Vydaná",
  ZAMIETNUTA: "Zamietnutá", STORNO: "Stornovaná",
};

type ZiadankaHeader = {
  id: number; number: string; status: string; cost_center: string | null; note: string | null;
  created_at: string; ziadatel: string; ziadatel_email: string | null;
  schvalil: string | null; approved_at: string | null; reject_note: string | null;
};
type Riadok = {
  id: number; item_id: number; qty_requested: number; qty_issued: number; line_status: string;
  code: string; name: string; unit: string; stock_qty: number; location: string | null;
  image_path: string | null; bundle_code: string | null; bundle_name: string | null;
};

export default async function ZiadankaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ z, riadky }, ctx] = await Promise.all([
    apiRead<{ z: ZiadankaHeader; riadky: Riadok[] }>(`/ziadanky/${id}`),
    getKontext(),
  ]);
  const role = ctx.user?.role || "";
  const vydajMozny = ["SCHVALENA", "CAKA_NA_TOVAR", "CIASTOCNE_VYDANA"].includes(z.status)
    && ["storekeeper", "admin"].includes(role);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">Žiadanka</div>
          <h1>{z.number}</h1>
        </div>
        <span className={`stav ${z.status}`} style={{ fontSize: 12, padding: "6px 12px" }}>{STAV_LABEL[z.status]}</span>
      </div>

      <div className="panel" style={{ margin: "14px 0 20px" }}>
        <div className="panel-b">
          <dl className="kv">
            <dt>Žiadateľ</dt><dd>{z.ziadatel} <span style={{ color: "var(--steel)" }}>({z.ziadatel_email || "—"})</span></dd>
            <dt>Stredisko</dt><dd>{z.cost_center || "—"}</dd>
            <dt>Vytvorené</dt><dd className="mono">{z.created_at}</dd>
            {z.schvalil && <><dt>Rozhodol</dt><dd>{z.schvalil} · {z.approved_at}</dd></>}
            {z.note && <><dt>Poznámka</dt><dd>{z.note}</dd></>}
            {z.reject_note && <><dt>Dôvod zamietnutia</dt><dd>{z.reject_note}</dd></>}
          </dl>
        </div>
      </div>

      <form action={issueRequestAction.bind(null, z.id)}>
        <div className="panel">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 56 }}></th>
                <th style={{ width: 96 }}>Kód</th>
                <th>Položka</th>
                <th style={{ width: 70 }}>Regál</th>
                <th className="num" style={{ width: 90 }}>Požadované</th>
                <th className="num" style={{ width: 80 }}>Vydané</th>
                <th className="num" style={{ width: 90 }}>Na sklade</th>
                {vydajMozny && <th style={{ width: 110 }}>Vydať teraz</th>}
              </tr>
            </thead>
            <tbody>
              {riadky.map((r) => {
                const zostava = r.qty_requested - r.qty_issued;
                const kryte = Math.min(zostava, r.stock_qty);
                return (
                  <tr key={r.id}>
                    <td><Mini path={r.image_path} kod={r.code} /></td>
                    <td className="mono">{r.code}</td>
                    <td>
                      {r.name}
                      {r.bundle_code && (
                        <div style={{ fontSize: 11.5, color: "var(--steel)" }}>z balíka {r.bundle_code} – {r.bundle_name}</div>
                      )}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.location || "—"}</td>
                    <td className="num">{r.qty_requested} {r.unit}</td>
                    <td className="num">{r.qty_issued}</td>
                    <td className="num" style={{ color: r.stock_qty < zostava ? "var(--zero)" : "inherit" }}>{r.stock_qty}</td>
                    {vydajMozny && (
                      <td>
                        {zostava > 0 ? (
                          <input type="number" name={`qty_${r.id}`} defaultValue={kryte > 0 ? kryte : 0}
                            min={0} max={Math.min(zostava, r.stock_qty)} step={1} />
                        ) : (
                          <span className="tag ok">vydané</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          {vydajMozny && <button className="btn" type="submit">Zaevidovať výdaj</button>}
        </div>
      </form>

      {z.status === "NOVA" && ["approver", "admin"].includes(role) && (
        <div className="panel" style={{ marginTop: 20, maxWidth: 620 }}>
          <div className="panel-h">Rozhodnutie schvaľovateľa</div>
          <div className="panel-b">
            <form action={approveRequestAction.bind(null, z.id)} style={{ display: "inline" }}>
              <button className="btn" type="submit">Schváliť</button>
            </form>
            <form action={rejectRequestAction.bind(null, z.id)} style={{ marginTop: 14 }}>
              <div className="field">
                <label htmlFor="duvod">Dôvod zamietnutia</label>
                <input type="text" id="duvod" name="duvod" placeholder="Napr. na linke je ešte dostatok kusov" />
              </div>
              <button className="btn warn" type="submit">Zamietnuť</button>
            </form>
          </div>
        </div>
      )}

      {["NOVA", "SCHVALENA", "CAKA_NA_TOVAR"].includes(z.status) && (
        <form action={cancelRequestAction.bind(null, z.id)} style={{ marginTop: 16 }}>
          <button className="btn warn sm" type="submit">Stornovať žiadanku</button>
        </form>
      )}

      <p style={{ marginTop: 24 }}><Link href="/ziadanky">← Späť na zoznam</Link></p>
    </>
  );
}

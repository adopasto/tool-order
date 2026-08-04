import Link from "next/link";
import { apiRead } from "@/lib/api";
import Mini from "@/components/Mini";
import { changeCartQtyAction, emptyCartAction, submitCartAction } from "@/lib/actions";

type Riadok = {
  cartItemId: number;
  kind: "item" | "bundle";
  id: number;
  qty: number;
  nazov: string | null;
  kod: string | null;
  jednotka: string | null;
  foto: string | null;
  sklad?: number;
  stav?: "ok" | "nizka" | "nula";
  komponenty?: { code: string; name: string; unit: string; qty: number }[];
  dostupnost?: number;
};

export default async function KosikPage() {
  const { riadky } = await apiRead<{ riadky: Riadok[] }>("/kosik");

  return (
    <>
      <h1>Košík</h1>
      <p className="sub">Skontrolujte množstvá a odošlite žiadanku. Schvaľuje ju vedúci vášho strediska, vydáva sklad.</p>

      {riadky.length === 0 ? (
        <div className="empty">
          Košík je prázdny.<br />
          <Link className="btn sec sm" style={{ marginTop: 12 }} href="/katalog">Prejsť do katalógu</Link>
        </div>
      ) : (
        <>
          <div className="panel">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 56 }}></th>
                  <th style={{ width: 96 }}>Kód</th>
                  <th>Položka</th>
                  <th style={{ width: 150 }}>Sklad</th>
                  <th style={{ width: 150 }}>Množstvo</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {riadky.map((r) => (
                  <tr key={r.cartItemId}>
                    <td><Mini path={r.foto} kod={r.kod || ""} /></td>
                    <td className="mono">{r.kod}</td>
                    <td>
                      <b>{r.nazov}</b>
                      {r.kind === "bundle" && r.komponenty && (
                        <div style={{ fontSize: 12, color: "var(--steel)", marginTop: 3 }}>
                          Balík: {r.komponenty.map((k) => `${k.qty}× ${k.code}`).join(", ")}
                        </div>
                      )}
                    </td>
                    <td>
                      {r.kind === "bundle" ? (
                        <span className={`tag ${(r.dostupnost || 0) > 0 ? "ok" : "nula"}`}>{r.dostupnost} sád</span>
                      ) : (
                        <span className={`tag ${r.stav}`}>{r.sklad} {r.jednotka}</span>
                      )}
                    </td>
                    <td>
                      <form action={changeCartQtyAction} style={{ display: "flex", gap: 6 }}>
                        <input type="hidden" name="cartItemId" value={r.cartItemId} />
                        <input type="number" name="qty" defaultValue={r.qty} min={0} step={1} style={{ width: 78 }} />
                        <button className="btn sec sm" type="submit">Uložiť</button>
                      </form>
                    </td>
                    <td>
                      <form action={changeCartQtyAction}>
                        <input type="hidden" name="cartItemId" value={r.cartItemId} />
                        <input type="hidden" name="qty" value={0} />
                        <button className="btn warn sm" type="submit">Odobrať</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form action={submitCartAction} style={{ marginTop: 18, maxWidth: 640 }}>
            <div className="field">
              <label htmlFor="note">Poznámka pre schvaľovateľa (nepovinné)</label>
              <textarea id="note" name="note" rows={3} placeholder="Napr. náhrada za poškodené náradie na linke SMT-1" />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" type="submit">Odoslať žiadanku</button>
              <Link className="btn sec" href="/katalog">Pokračovať vo výbere</Link>
            </div>
          </form>

          <form action={emptyCartAction} style={{ marginTop: 12 }}>
            <button className="btn warn sm" type="submit">Vyprázdniť košík</button>
          </form>
        </>
      )}
    </>
  );
}

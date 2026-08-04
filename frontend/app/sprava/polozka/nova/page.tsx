import { apiRead } from "@/lib/api";
import Breadcrumbs from "@/components/Breadcrumbs";
import { createItemAction } from "@/lib/actions";
import type { Category } from "@/lib/types";

const JEDNOTKY = ["ks", "pár", "bal", "sada", "l", "m", "kg"];

export default async function NovaPolozkaPage() {
  const { kategorie } = await apiRead<{ kategorie: Category[] }>("/sprava/polozka/nova");

  return (
    <>
      <Breadcrumbs items={[{ text: "Správa", href: "/sprava" }, { text: "Položky", href: "/sprava/polozky" }, { text: "Nová položka" }]} />

      <div className="hlavicka">
        <div>
          <h1>Nová položka</h1>
          <p className="sub">Kód sa použije aj ako názov súboru fotky, preto ho voľ tak, aby sa nemenil.</p>
        </div>
      </div>

      <form action={createItemAction}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
          <div className="panel">
            <div className="panel-h">Základné údaje</div>
            <div className="panel-b">
              <div className="formrow">
                <div className="field" style={{ flex: "0 0 160px" }}><label htmlFor="code">Kód *</label>
                  <input className="mono" type="text" id="code" name="code" required maxLength={20} placeholder="NAR-001" /></div>
                <div className="field"><label htmlFor="name">Názov *</label>
                  <input type="text" id="name" name="name" required /></div>
              </div>
              <div className="field"><label htmlFor="description">Popis</label>
                <textarea id="description" name="description" rows={3} /></div>
              <div className="formrow">
                <div className="field"><label htmlFor="category_id">Kategória</label>
                  <select id="category_id" name="category_id" defaultValue="">
                    <option value="">—</option>
                    {kategorie.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div className="field" style={{ flex: "0 0 110px" }}><label htmlFor="unit">Jednotka</label>
                  <select id="unit" name="unit" defaultValue="ks">
                    {JEDNOTKY.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select></div>
                <div className="field" style={{ flex: "0 0 130px" }}><label htmlFor="location">Regál / box</label>
                  <input type="text" id="location" name="location" placeholder="A1-03" /></div>
              </div>
              <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                <label className="check"><input type="checkbox" name="is_esd" /> ESD položka</label>
                <label className="check"><input type="checkbox" name="active" defaultChecked /> Aktívna v katalógu</label>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-h">Zásoba</div>
            <div className="panel-b">
              <div className="field"><label htmlFor="pociatocny_stav">Počiatočný stav na sklade</label>
                <input type="number" id="pociatocny_stav" name="pociatocny_stav" defaultValue={0} min={0} step="any" />
                <div className="napoveda">Zapíše sa ako pohyb typu INVENTÚRA – história sedí od prvého kusu.</div></div>
              <div className="formrow">
                <div className="field"><label htmlFor="reorder_point">Signálna zásoba</label>
                  <input type="number" id="reorder_point" name="reorder_point" defaultValue={5} min={0} step="any" /></div>
                <div className="field"><label htmlFor="reorder_qty">Doobjednať po</label>
                  <input type="number" id="reorder_qty" name="reorder_qty" min={0} step="any" /></div>
              </div>
              <div className="napoveda">Pri poklese na signálnu zásobu sa položka objaví v zozname „Doobjednať".</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button className="btn" type="submit">Založiť položku</button>
          <a className="btn sec" href="/sprava/polozky">Zrušiť</a>
        </div>
      </form>
    </>
  );
}

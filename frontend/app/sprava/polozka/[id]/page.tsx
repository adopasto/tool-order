import { apiRead } from "@/lib/api";
import Breadcrumbs from "@/components/Breadcrumbs";
import ConfirmForm from "@/components/ConfirmForm";
import {
  addItemSupplierAction, deleteItemAction, deletePhotoAction,
  removeItemSupplierAction, updateItemAction, uploadPhotoAction,
} from "@/lib/actions";
import type { Category, Item } from "@/lib/types";

const JEDNOTKY = ["ks", "pár", "bal", "sada", "l", "m", "kg"];

type ItemSupplier = {
  id: number; name: string; supplier_sku: string | null; price: number | null;
  min_order_qty: number; is_primary: number;
};
type SupplierOption = { id: number; name: string };

type PolozkaFormData = {
  p: Item; kategorie: Category[]; dodavatelia: ItemSupplier[]; vsetciDodavatelia: SupplierOption[];
};

export default async function PolozkaEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { p, kategorie, dodavatelia, vsetciDodavatelia } = await apiRead<PolozkaFormData>(`/sprava/polozka/${id}`);
  const itemId = Number(id);

  return (
    <>
      <Breadcrumbs items={[
        { text: "Správa", href: "/sprava" }, { text: "Položky", href: "/sprava/polozky" }, { text: p.code },
      ]} />

      <div className="hlavicka">
        <div>
          <h1>{p.name}</h1>
          <p className="sub">Zmeny sa prejavia v katalógu okamžite.</p>
        </div>
        <a className="btn sec" href={`/produkt/${p.id}`}>Zobraziť kartu</a>
      </div>

      <form action={updateItemAction.bind(null, itemId)}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
          <div className="panel">
            <div className="panel-h">Základné údaje</div>
            <div className="panel-b">
              <div className="formrow">
                <div className="field" style={{ flex: "0 0 160px" }}><label htmlFor="code">Kód *</label>
                  <input className="mono" type="text" id="code" name="code" defaultValue={p.code} required maxLength={20} /></div>
                <div className="field"><label htmlFor="name">Názov *</label>
                  <input type="text" id="name" name="name" defaultValue={p.name} required /></div>
              </div>
              <div className="field"><label htmlFor="description">Popis</label>
                <textarea id="description" name="description" rows={3} defaultValue={p.description || ""} /></div>
              <div className="formrow">
                <div className="field"><label htmlFor="category_id">Kategória</label>
                  <select id="category_id" name="category_id" defaultValue={p.category_id ?? ""}>
                    <option value="">—</option>
                    {kategorie.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div className="field" style={{ flex: "0 0 110px" }}><label htmlFor="unit">Jednotka</label>
                  <select id="unit" name="unit" defaultValue={p.unit || "ks"}>
                    {JEDNOTKY.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select></div>
                <div className="field" style={{ flex: "0 0 130px" }}><label htmlFor="location">Regál / box</label>
                  <input type="text" id="location" name="location" defaultValue={p.location || ""} placeholder="A1-03" /></div>
              </div>
              <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                <label className="check"><input type="checkbox" name="is_esd" defaultChecked={!!p.is_esd} /> ESD položka</label>
                <label className="check"><input type="checkbox" name="active" defaultChecked={!!p.active} /> Aktívna v katalógu</label>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-h">Zásoba</div>
            <div className="panel-b">
              <dl className="kv" style={{ marginBottom: 14 }}>
                <dt>Aktuálny stav</dt>
                <dd><b className="mono" style={{ fontSize: 17 }}>{p.stock_qty}</b> {p.unit}
                  <span className="napoveda" style={{ display: "inline" }}> — mení sa len cez Sklad</span></dd>
              </dl>
              <div className="formrow">
                <div className="field"><label htmlFor="reorder_point">Signálna zásoba</label>
                  <input type="number" id="reorder_point" name="reorder_point" defaultValue={p.reorder_point ?? 5} min={0} step="any" /></div>
                <div className="field"><label htmlFor="reorder_qty">Doobjednať po</label>
                  <input type="number" id="reorder_qty" name="reorder_qty" defaultValue={p.reorder_qty ?? ""} min={0} step="any" /></div>
              </div>
              <div className="napoveda">Pri poklese na signálnu zásobu sa položka objaví v zozname „Doobjednať".</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button className="btn" type="submit">Uložiť zmeny</button>
          <a className="btn sec" href="/sprava/polozky">Zrušiť</a>
        </div>
      </form>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 24, alignItems: "start" }}>
        <div className="panel">
          <div className="panel-h">Fotka</div>
          <div className="panel-b">
            {p.image_path && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/foto/${encodeURIComponent(p.image_path)}`} alt=""
                style={{ width: "100%", maxHeight: 220, objectFit: "contain", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "var(--r)", marginBottom: 12 }} />
            )}
            <form action={uploadPhotoAction.bind(null, itemId)} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="file" name="foto" accept="image/*" style={{ border: 0, padding: 0, fontSize: 13 }} />
              <button className="btn sec sm" type="submit">Nahrať</button>
            </form>
            {p.image_path && (
              <form action={deletePhotoAction.bind(null, itemId)} style={{ marginTop: 8 }}>
                <button className="btn warn sm" type="submit">Odstrániť fotku</button>
              </form>
            )}
            <div className="napoveda">JPG, PNG alebo WEBP do 4 MB. Uloží sa ako <span className="mono">{p.code}.jpg</span>.</div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">Dodávatelia</div>
          <table className="tbl">
            <tbody>
              {dodavatelia.length === 0 && (
                <tr><td className="napoveda" style={{ padding: 12 }}>Zatiaľ žiadny dodávateľ.</td></tr>
              )}
              {dodavatelia.map((d) => (
                <tr key={d.id}>
                  <td>
                    {d.name}{d.is_primary ? " · hlavný" : ""}
                    <div className="mono" style={{ fontSize: 11.5, color: "var(--steel)" }}>
                      {d.supplier_sku || "—"}{d.price != null ? ` · ${d.price.toFixed(2)} €` : ""}
                    </div>
                  </td>
                  <td style={{ width: 60 }}>
                    <form action={removeItemSupplierAction.bind(null, itemId, d.id)}>
                      <button className="btn warn sm" type="submit">×</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="panel-b" style={{ borderTop: "1px solid var(--line)" }}>
            <form action={addItemSupplierAction.bind(null, itemId)}>
              <div className="field"><label htmlFor="supplier_id">Pridať dodávateľa</label>
                <select id="supplier_id" name="supplier_id" required defaultValue="">
                  <option value="">— vyberte —</option>
                  {vsetciDodavatelia.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              <div className="formrow">
                <div className="field"><label htmlFor="supplier_sku">Kat. číslo</label>
                  <input type="text" id="supplier_sku" name="supplier_sku" /></div>
                <div className="field"><label htmlFor="price">Cena €</label>
                  <input type="number" id="price" name="price" step="0.01" min={0} /></div>
                <div className="field"><label htmlFor="min_order_qty">Min. obj.</label>
                  <input type="number" id="min_order_qty" name="min_order_qty" defaultValue={1} min={1} step="any" /></div>
              </div>
              <label className="check" style={{ marginBottom: 12 }}><input type="checkbox" name="is_primary" /> Hlavný dodávateľ</label>
              <button className="btn sec" type="submit">Priradiť</button>
            </form>
          </div>
        </div>
      </div>

      <ConfirmForm action={deleteItemAction.bind(null, itemId)} confirmText={`Naozaj zmazať položku ${p.code}?`} style={{ marginTop: 24 }}>
        <button className="btn warn sm" type="submit">Zmazať položku</button>
        <span className="napoveda" style={{ display: "inline", marginLeft: 10 }}>
          Ak už má históriu pohybov, len sa deaktivuje – evidencia zostane.
        </span>
      </ConfirmForm>
    </>
  );
}

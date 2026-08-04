import { apiRead } from "@/lib/api";
import Breadcrumbs from "@/components/Breadcrumbs";
import Mini from "@/components/Mini";
import ConfirmForm from "@/components/ConfirmForm";
import {
  addBundleComponentAction, deleteBundleAction, removeBundleComponentAction, updateBundleAction,
} from "@/lib/actions";
import type { Category } from "@/lib/types";

type Bundle = { id: number; code: string | null; name: string; description: string | null; category_id: number | null; active: number };
type Komponent = { id: number; code: string; name: string; unit: string; stock_qty: number; image_path: string | null; qty: number };
type ItemOption = { id: number; code: string; name: string; unit: string };

export default async function BalikEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { b, komponenty, kategorie, polozky } = await apiRead<{
    b: Bundle; komponenty: Komponent[]; kategorie: Category[]; polozky: ItemOption[];
  }>(`/sprava/balik/${id}`);
  const bundleId = Number(id);

  return (
    <>
      <Breadcrumbs items={[
        { text: "Správa", href: "/sprava" }, { text: "Balíky", href: "/sprava/baliky" }, { text: b.code || b.name },
      ]} />

      <h1>{b.name}</h1>
      <p className="sub">Zmeny sa prejavia v katalógu okamžite.</p>

      <form action={updateBundleAction.bind(null, bundleId)} style={{ maxWidth: 820 }}>
        <div className="panel"><div className="panel-b">
          <div className="formrow">
            <div className="field" style={{ flex: "0 0 160px" }}><label htmlFor="code">Kód</label>
              <input className="mono" type="text" id="code" name="code" defaultValue={b.code || ""} placeholder="BAL-001" /></div>
            <div className="field"><label htmlFor="name">Názov *</label>
              <input type="text" id="name" name="name" defaultValue={b.name} required /></div>
            <div className="field" style={{ flex: "0 0 200px" }}><label htmlFor="category_id">Kategória</label>
              <select id="category_id" name="category_id" defaultValue={b.category_id ?? ""}>
                <option value="">—</option>
                {kategorie.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
          </div>
          <div className="field"><label htmlFor="description">Popis</label>
            <textarea id="description" name="description" rows={2} defaultValue={b.description || ""} /></div>
          <label className="check"><input type="checkbox" name="active" defaultChecked={!!b.active} /> Aktívny v katalógu</label>
        </div></div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn" type="submit">Uložiť hlavičku</button>
          <a className="btn sec" href="/sprava/baliky">Späť na zoznam</a>
        </div>
      </form>

      <h2>Obsah balíka</h2>
      <div className="panel" style={{ maxWidth: 820 }}>
        <table className="tbl">
          <thead><tr>
            <th style={{ width: 56 }}></th><th style={{ width: 100 }}>Kód</th><th>Položka</th>
            <th className="num" style={{ width: 100 }}>Množstvo</th>
            <th className="num" style={{ width: 100 }}>Na sklade</th><th style={{ width: 60 }}></th>
          </tr></thead>
          <tbody>
            {komponenty.length === 0 && (
              <tr><td colSpan={6} className="napoveda" style={{ padding: 14 }}>Balík je zatiaľ prázdny – pridaj prvú položku nižšie.</td></tr>
            )}
            {komponenty.map((k) => (
              <tr key={k.id}>
                <td><Mini path={k.image_path} kod={k.code} /></td>
                <td className="mono">{k.code}</td>
                <td>{k.name}</td>
                <td className="num">{k.qty} {k.unit}</td>
                <td className="num">{k.stock_qty}</td>
                <td>
                  <form action={removeBundleComponentAction.bind(null, bundleId, k.id)}>
                    <button className="btn warn sm" type="submit">×</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="panel-b" style={{ borderTop: "1px solid var(--line)" }}>
          <form action={addBundleComponentAction.bind(null, bundleId)} className="formrow">
            <div className="field" style={{ flex: "1 1 320px" }}><label htmlFor="item_id">Pridať položku</label>
              <select id="item_id" name="item_id" required defaultValue="">
                <option value="">— vyberte —</option>
                {polozky.map((i) => <option key={i.id} value={i.id}>{i.code} – {i.name}</option>)}
              </select></div>
            <div className="field" style={{ flex: "0 0 120px" }}><label htmlFor="qty">Množstvo</label>
              <input type="number" id="qty" name="qty" defaultValue={1} min={0.001} step="any" required /></div>
            <div className="field" style={{ flex: "0 0 auto" }}><button className="btn sec" type="submit">Pridať</button></div>
          </form>
        </div>
      </div>

      <ConfirmForm action={deleteBundleAction.bind(null, bundleId)} confirmText="Naozaj zmazať balík?" style={{ marginTop: 24 }}>
        <button className="btn warn sm" type="submit">Zmazať balík</button>
      </ConfirmForm>
    </>
  );
}

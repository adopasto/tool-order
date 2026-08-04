import { apiRead } from "@/lib/api";
import Breadcrumbs from "@/components/Breadcrumbs";
import { createBundleAction } from "@/lib/actions";
import type { Category } from "@/lib/types";

export default async function NovyBalikPage() {
  const { kategorie } = await apiRead<{ kategorie: Category[] }>("/sprava/balik/novy");

  return (
    <>
      <Breadcrumbs items={[{ text: "Správa", href: "/sprava" }, { text: "Balíky", href: "/sprava/baliky" }, { text: "Nový balík" }]} />

      <h1>Nový balík</h1>
      <p className="sub">Najprv ulož hlavičku, potom pridávaj položky.</p>

      <form action={createBundleAction} style={{ maxWidth: 820 }}>
        <div className="panel"><div className="panel-b">
          <div className="formrow">
            <div className="field" style={{ flex: "0 0 160px" }}><label htmlFor="code">Kód</label>
              <input className="mono" type="text" id="code" name="code" placeholder="BAL-001" /></div>
            <div className="field"><label htmlFor="name">Názov *</label>
              <input type="text" id="name" name="name" required /></div>
            <div className="field" style={{ flex: "0 0 200px" }}><label htmlFor="category_id">Kategória</label>
              <select id="category_id" name="category_id" defaultValue="">
                <option value="">—</option>
                {kategorie.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
          </div>
          <div className="field"><label htmlFor="description">Popis</label>
            <textarea id="description" name="description" rows={2} /></div>
          <label className="check"><input type="checkbox" name="active" defaultChecked /> Aktívny v katalógu</label>
        </div></div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn" type="submit">Založiť balík</button>
          <a className="btn sec" href="/sprava/baliky">Späť na zoznam</a>
        </div>
      </form>
    </>
  );
}

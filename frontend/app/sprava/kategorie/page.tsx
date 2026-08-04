import { apiRead } from "@/lib/api";
import Breadcrumbs from "@/components/Breadcrumbs";
import { createCategoryAction, deleteCategoryAction, updateCategoryAction } from "@/lib/actions";

type KategoriaRow = { id: number; name: string; sort_order: number; pocet_poloziek: number; pocet_balikov: number };

export default async function SpravaKategoriePage() {
  const { kategorie } = await apiRead<{ kategorie: KategoriaRow[] }>("/sprava/kategorie");

  return (
    <>
      <Breadcrumbs items={[{ text: "Správa", href: "/sprava" }, { text: "Kategórie" }]} />

      <h1>Kategórie</h1>
      <p className="sub">Určujú ľavé menu v katalógu. Poradie je číslo – čím nižšie, tým vyššie v zozname.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>
        <div className="panel">
          <table className="tbl">
            <thead><tr>
              <th>Názov</th><th className="num" style={{ width: 90 }}>Položiek</th>
              <th className="num" style={{ width: 80 }}>Balíkov</th>
              <th style={{ width: 100 }}>Poradie</th><th style={{ width: 140 }}></th>
            </tr></thead>
            <tbody>
              {kategorie.map((c) => (
                <tr key={c.id}>
                  <td><input form={`k${c.id}`} type="text" name="name" defaultValue={c.name} /></td>
                  <td className="num">{c.pocet_poloziek}</td>
                  <td className="num">{c.pocet_balikov}</td>
                  <td><input form={`k${c.id}`} type="number" name="sort_order" defaultValue={c.sort_order} /></td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button form={`k${c.id}`} className="btn sec sm" type="submit">Uložiť</button>
                    {c.pocet_poloziek === 0 && c.pocet_balikov === 0 && (
                      <button form={`kd${c.id}`} className="btn warn sm" type="submit">×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="panel-h">Nová kategória</div>
          <div className="panel-b">
            <form action={createCategoryAction}>
              <div className="field"><label htmlFor="nk">Názov</label><input type="text" id="nk" name="name" required /></div>
              <div className="field"><label htmlFor="ns">Poradie</label>
                <input type="number" id="ns" name="sort_order" defaultValue={(kategorie.length + 1) * 10} /></div>
              <button className="btn sec" type="submit">Pridať</button>
            </form>
          </div>
        </div>
      </div>

      {kategorie.map((c) => (
        <div key={c.id} style={{ display: "none" }}>
          <form id={`k${c.id}`} action={updateCategoryAction.bind(null, c.id)}></form>
          <form id={`kd${c.id}`} action={deleteCategoryAction.bind(null, c.id)}></form>
        </div>
      ))}
    </>
  );
}

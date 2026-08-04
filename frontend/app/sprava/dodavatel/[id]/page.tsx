import { apiRead } from "@/lib/api";
import Breadcrumbs from "@/components/Breadcrumbs";
import ConfirmForm from "@/components/ConfirmForm";
import { deleteSupplierAction, updateSupplierAction } from "@/lib/actions";

type Dodavatel = {
  id: number; name: string; ico: string | null; dic: string | null; contact_person: string | null;
  email: string | null; phone: string | null; web: string | null; address: string | null;
  lead_time_days: number; note: string | null; active: number;
};
type Polozka = { id: number; code: string; name: string; supplier_sku: string | null; price: number | null; is_primary: number };

export default async function DodavatelEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { d, polozky } = await apiRead<{ d: Dodavatel; polozky: Polozka[] }>(`/sprava/dodavatel/${id}`);
  const supplierId = Number(id);

  return (
    <>
      <Breadcrumbs items={[
        { text: "Správa", href: "/sprava" }, { text: "Dodávatelia", href: "/sprava/dodavatelia" }, { text: d.name },
      ]} />

      <h1>{d.name}</h1>
      <p className="sub">Evidencia pre orientáciu – kto čo dodáva a za akú dobu.</p>

      <form action={updateSupplierAction.bind(null, supplierId)} style={{ maxWidth: 820 }}>
        <div className="panel"><div className="panel-b">
          <div className="formrow">
            <div className="field"><label htmlFor="name">Názov *</label>
              <input type="text" id="name" name="name" defaultValue={d.name} required /></div>
            <div className="field" style={{ flex: "0 0 150px" }}><label htmlFor="ico">IČO</label>
              <input className="mono" type="text" id="ico" name="ico" defaultValue={d.ico || ""} /></div>
          </div>
          <div className="formrow">
            <div className="field"><label htmlFor="contact_person">Kontaktná osoba</label>
              <input type="text" id="contact_person" name="contact_person" defaultValue={d.contact_person || ""} /></div>
            <div className="field"><label htmlFor="email">E-mail</label>
              <input type="text" id="email" name="email" defaultValue={d.email || ""} /></div>
            <div className="field"><label htmlFor="phone">Telefón</label>
              <input type="text" id="phone" name="phone" defaultValue={d.phone || ""} /></div>
          </div>
          <div className="formrow">
            <div className="field"><label htmlFor="address">Adresa</label>
              <input type="text" id="address" name="address" defaultValue={d.address || ""} /></div>
            <div className="field"><label htmlFor="web">Web</label>
              <input type="text" id="web" name="web" defaultValue={d.web || ""} /></div>
            <div className="field" style={{ flex: "0 0 160px" }}><label htmlFor="lead_time_days">Dodacia lehota (dní)</label>
              <input type="number" id="lead_time_days" name="lead_time_days" defaultValue={d.lead_time_days ?? 7} min={0} /></div>
          </div>
          <div className="field"><label htmlFor="note">Poznámka</label>
            <textarea id="note" name="note" rows={2} defaultValue={d.note || ""} /></div>
          <label className="check"><input type="checkbox" name="active" defaultChecked={!!d.active} /> Aktívny</label>
        </div></div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn" type="submit">Uložiť</button>
          <a className="btn sec" href="/sprava/dodavatelia">Späť na zoznam</a>
        </div>
      </form>

      <h2>Dodávané položky</h2>
      <div className="panel" style={{ maxWidth: 820 }}>
        <table className="tbl">
          <thead><tr>
            <th style={{ width: 110 }}>Kód</th><th>Položka</th><th style={{ width: 130 }}>Kat. č.</th>
            <th className="num" style={{ width: 90 }}>Cena</th>
          </tr></thead>
          <tbody>
            {polozky.length === 0 && (
              <tr><td colSpan={4} className="napoveda" style={{ padding: 14 }}>
                Žiadne položky. Väzbu pridáš vo formulári konkrétnej položky.
              </td></tr>
            )}
            {polozky.map((i) => (
              <tr key={i.id}>
                <td className="mono"><a href={`/sprava/polozka/${i.id}`}>{i.code}</a></td>
                <td>{i.name}{i.is_primary ? " · hlavný dodávateľ" : ""}</td>
                <td className="mono">{i.supplier_sku || "—"}</td>
                <td className="num">{i.price != null ? `${i.price.toFixed(2)} €` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmForm action={deleteSupplierAction.bind(null, supplierId)} confirmText="Naozaj zmazať dodávateľa?" style={{ marginTop: 24 }}>
        <button className="btn warn sm" type="submit">Zmazať dodávateľa</button>
      </ConfirmForm>
    </>
  );
}

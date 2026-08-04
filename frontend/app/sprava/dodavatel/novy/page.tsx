import Breadcrumbs from "@/components/Breadcrumbs";
import { createSupplierAction } from "@/lib/actions";

export default function NovyDodavatelPage() {
  return (
    <>
      <Breadcrumbs items={[
        { text: "Správa", href: "/sprava" }, { text: "Dodávatelia", href: "/sprava/dodavatelia" }, { text: "Nový" },
      ]} />

      <h1>Nový dodávateľ</h1>
      <p className="sub">Evidencia pre orientáciu – kto čo dodáva a za akú dobu.</p>

      <form action={createSupplierAction} style={{ maxWidth: 820 }}>
        <div className="panel"><div className="panel-b">
          <div className="formrow">
            <div className="field"><label htmlFor="name">Názov *</label>
              <input type="text" id="name" name="name" required /></div>
            <div className="field" style={{ flex: "0 0 150px" }}><label htmlFor="ico">IČO</label>
              <input className="mono" type="text" id="ico" name="ico" /></div>
          </div>
          <div className="formrow">
            <div className="field"><label htmlFor="contact_person">Kontaktná osoba</label>
              <input type="text" id="contact_person" name="contact_person" /></div>
            <div className="field"><label htmlFor="email">E-mail</label>
              <input type="text" id="email" name="email" /></div>
            <div className="field"><label htmlFor="phone">Telefón</label>
              <input type="text" id="phone" name="phone" /></div>
          </div>
          <div className="formrow">
            <div className="field"><label htmlFor="address">Adresa</label>
              <input type="text" id="address" name="address" /></div>
            <div className="field"><label htmlFor="web">Web</label>
              <input type="text" id="web" name="web" /></div>
            <div className="field" style={{ flex: "0 0 160px" }}><label htmlFor="lead_time_days">Dodacia lehota (dní)</label>
              <input type="number" id="lead_time_days" name="lead_time_days" defaultValue={7} min={0} /></div>
          </div>
          <div className="field"><label htmlFor="note">Poznámka</label>
            <textarea id="note" name="note" rows={2} /></div>
          <label className="check"><input type="checkbox" name="active" defaultChecked /> Aktívny</label>
        </div></div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn" type="submit">Uložiť</button>
          <a className="btn sec" href="/sprava/dodavatelia">Späť na zoznam</a>
        </div>
      </form>
    </>
  );
}

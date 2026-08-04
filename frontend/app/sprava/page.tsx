import Link from "next/link";
import { apiRead } from "@/lib/api";
import { scanPhotosAction } from "@/lib/actions";

type Pocty = { polozky: number; aktivne: number; bezFotky: number; baliky: number; kategorie: number; dodavatelia: number };

export default async function SpravaPage() {
  const { pocty } = await apiRead<{ pocty: Pocty }>("/sprava");

  return (
    <>
      <h1>Správa sortimentu</h1>
      <p className="sub">
        Všetko, čo sa dá v katalógu zakladať a meniť. Stav skladu sa odtiaľto nemení –
        ten sa hýbe len príjmom, výdajom a inventúrou v sekcii Sklad.
      </p>

      <div className="dlazdice">
        <Link className="dlazdica" href="/sprava/polozky">
          <div className="eyebrow">Katalóg</div>
          <div className="dl-nadpis">Položky</div>
          <div className="dl-cislo">{pocty.polozky}</div>
          <div className="dl-popis">{pocty.aktivne} aktívnych{pocty.bezFotky ? ` · ${pocty.bezFotky} bez fotky` : ""}</div>
        </Link>
        <Link className="dlazdica" href="/sprava/baliky">
          <div className="eyebrow">Zostavy</div>
          <div className="dl-nadpis">Balíky</div>
          <div className="dl-cislo">{pocty.baliky}</div>
          <div className="dl-popis">kombinácie položiek pre typové výdaje</div>
        </Link>
        <Link className="dlazdica" href="/sprava/kategorie">
          <div className="eyebrow">Členenie</div>
          <div className="dl-nadpis">Kategórie</div>
          <div className="dl-cislo">{pocty.kategorie}</div>
          <div className="dl-popis">ľavé menu v katalógu</div>
        </Link>
        <Link className="dlazdica" href="/sprava/dodavatelia">
          <div className="eyebrow">Evidencia</div>
          <div className="dl-nadpis">Dodávatelia</div>
          <div className="dl-cislo">{pocty.dodavatelia}</div>
          <div className="dl-popis">kontakty a čo kto dodáva</div>
        </Link>
      </div>

      <div className="panel" style={{ marginTop: 22 }}>
        <div className="panel-h">Rýchle akcie</div>
        <div className="panel-b" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn" href="/sprava/polozka/nova">+ Nová položka</Link>
          <Link className="btn sec" href="/sprava/balik/novy">+ Nový balík</Link>
          <Link className="btn sec" href="/sprava/dodavatel/novy">+ Nový dodávateľ</Link>
          <form action={scanPhotosAction}>
            <button className="btn sec" type="submit">Priradiť fotky z priečinka</button>
          </form>
        </div>
      </div>
    </>
  );
}

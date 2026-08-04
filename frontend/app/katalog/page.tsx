import Link from "next/link";
import { apiRead } from "@/lib/api";
import { getKontext } from "@/lib/kontext";
import type { Category, Item, Bundle } from "@/lib/types";
import Mini from "@/components/Mini";
import BinLabel from "@/components/BinLabel";
import AddToCartForm from "@/components/AddToCartForm";

type KatalogData = {
  kategorie: Category[];
  spolu: number;
  polozky: Item[];
  baliky: Bundle[];
  cat: number | null;
  q: string;
  typ: "polozky" | "baliky";
  zobrazenie: "dlazdice" | "zoznam";
};

export default async function KatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; q?: string; typ?: string; zobrazenie?: string }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.cat) params.set("cat", sp.cat);
  if (sp.q) params.set("q", sp.q);
  if (sp.typ) params.set("typ", sp.typ);
  if (sp.zobrazenie) params.set("zobrazenie", sp.zobrazenie);

  const [data, ctx] = await Promise.all([
    apiRead<KatalogData>(`/katalog?${params.toString()}`),
    getKontext(),
  ]);
  const { kategorie, spolu, polozky, baliky, cat, q, typ, zobrazenie } = data;
  const showAdminLinks = !!ctx.user && ["admin", "storekeeper"].includes(ctx.user.role);
  const canSeeSignal = !!ctx.user && ["admin", "buyer"].includes(ctx.user.role);

  const qs = (extra: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    p.set("typ", String(extra.typ ?? typ));
    p.set("zobrazenie", String(extra.zobrazenie ?? zobrazenie));
    const c = extra.cat !== undefined ? extra.cat : cat;
    if (c) p.set("cat", String(c));
    const query = extra.q !== undefined ? String(extra.q) : q;
    if (query) p.set("q", query);
    return `/katalog?${p.toString()}`;
  };

  return (
    <>
      <div className="hlavicka">
        <div>
          <h1>Katalóg</h1>
          <p className="sub">Kliknutím na položku otvoríš jej kartu. Množstvo zadaj priamo tu a pridaj do košíka.</p>
        </div>
        {showAdminLinks && (
          <div style={{ display: "flex", gap: 8 }}>
            <Link className="btn" href="/sprava/polozka/nova">+ Nová položka</Link>
            <Link className="btn sec" href="/sprava/balik/novy">+ Nový balík</Link>
          </div>
        )}
      </div>

      <div className="cols">
        <aside>
          <div className="panel rail">
            <div className="panel-h">Kategórie</div>
            <div style={{ padding: "6px 0" }}>
              <Link href={qs({ cat: undefined })} className={!cat ? "active" : ""}>
                Všetko<span>{spolu}</span>
              </Link>
              {kategorie.map((k) => (
                <Link key={k.id} href={qs({ cat: k.id })} className={cat === k.id ? "active" : ""}>
                  {k.name}<span>{k.pocet}</span>
                </Link>
              ))}
            </div>
          </div>
        </aside>

        <section>
          <div className="toolbar">
            <div className="tabs">
              <Link href={qs({ typ: "polozky" })} className={typ === "polozky" ? "active" : ""}>Položky</Link>
              <Link href={qs({ typ: "baliky" })} className={typ === "baliky" ? "active" : ""}>Balíky</Link>
            </div>
            <form className="grow" method="get" action="/katalog" style={{ display: "flex", gap: 8 }}>
              <input type="hidden" name="typ" value={typ} />
              <input type="hidden" name="zobrazenie" value={zobrazenie} />
              {cat ? <input type="hidden" name="cat" value={cat} /> : null}
              <input type="search" name="q" defaultValue={q} placeholder="Hľadať podľa názvu, kódu alebo regálu" />
              <button className="btn sec" type="submit">Hľadať</button>
              {q ? <Link className="btn sec" href={qs({ q: "" })}>Zrušiť</Link> : null}
            </form>
            <div className="tabs">
              <Link href={qs({ zobrazenie: "dlazdice" })} className={zobrazenie === "dlazdice" ? "active" : ""} title="Dlaždice">▦</Link>
              <Link href={qs({ zobrazenie: "zoznam" })} className={zobrazenie === "zoznam" ? "active" : ""} title="Zoznam">☰</Link>
            </div>
          </div>

          {typ === "polozky" ? (
            <PolozkyView polozky={polozky} zobrazenie={zobrazenie} canSeeSignal={canSeeSignal} />
          ) : (
            <BalikyView baliky={baliky} />
          )}
        </section>
      </div>
    </>
  );
}

function PolozkyView({ polozky, zobrazenie, canSeeSignal }: { polozky: Item[]; zobrazenie: string; canSeeSignal: boolean }) {
  if (polozky.length === 0) {
    return <div className="empty">Žiadna položka nezodpovedá filtru.</div>;
  }

  if (zobrazenie === "zoznam") {
    return (
      <div className="panel">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 56 }}></th><th style={{ width: 96 }}>Kód</th><th>Položka</th>
              <th style={{ width: 70 }}>Regál</th><th className="num" style={{ width: 110 }}>Na sklade</th>
              <th style={{ width: 110 }}>Stav</th><th style={{ width: 180 }}>Do košíka</th>
            </tr>
          </thead>
          <tbody>
            {polozky.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/produkt/${p.id}`}><Mini path={p.image_path} kod={p.code} /></Link></td>
                <td className="mono"><Link href={`/produkt/${p.id}`}>{p.code}</Link></td>
                <td>
                  <Link href={`/produkt/${p.id}`} className="odkaz-ink">{p.name}</Link>
                  {p.is_esd ? " · ESD" : ""}
                </td>
                <td className="mono" style={{ fontSize: 12 }}>{p.location || "—"}</td>
                <td className="num"><b>{p.stock_qty}</b> {p.unit}</td>
                <td><span className={`tag ${p.stav}`}>
                  {p.stav === "ok" ? "v poriadku" : p.stav === "nizka" ? "nízka" : "vypredané"}
                </span></td>
                <td><AddToCartForm kind="item" id={p.id} className="" label="Pridať" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="grid">
      {polozky.map((p) => (
        <article key={p.id} className={`card ${p.is_esd ? "esd" : ""}`}>
          <Link className="karta-odkaz" href={`/produkt/${p.id}`}>
            <div className="foto">
              {p.image_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/foto/${encodeURIComponent(p.image_path)}`} alt={p.name} loading="lazy" />
              ) : (
                <div className="foto-nic"><span>{p.code}</span>bez fotky</div>
              )}
            </div>
            <div className="card-b">
              <div className="kod">{p.code}{p.is_esd ? " · ESD" : ""}</div>
              <div className="nazov">{p.name}</div>
              <p className="popis">{p.description || ""}</p>
              <div className="meta">{p.location ? `Regál ${p.location}` : "bez umiestnenia"}</div>
            </div>
            <BinLabel
              stockQty={p.stock_qty} unit={p.unit} reorderPoint={p.reorder_point} stav={p.stav!}
              legend={canSeeSignal ? `signálna zásoba ${p.reorder_point} ${p.unit}` : undefined}
            />
          </Link>
          <AddToCartForm kind="item" id={p.id} />
        </article>
      ))}
    </div>
  );
}

function BalikyView({ baliky }: { baliky: Bundle[] }) {
  if (baliky.length === 0) {
    return <div className="empty">Zatiaľ tu nie sú žiadne balíky.</div>;
  }
  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))" }}>
      {baliky.map((b) => (
        <article key={b.id} className="card">
          <Link className="karta-odkaz" href={`/balik/${b.id}`}>
            <div className="card-b">
              <div className="kod">{b.code || ""}{b.cat_name ? ` · ${b.cat_name}` : ""}</div>
              <div className="nazov">{b.name}</div>
              <p className="popis">{b.description || ""}</p>
              <table className="tbl" style={{ marginTop: 10 }}>
                <tbody>
                  {b.komponenty.slice(0, 5).map((k) => (
                    <tr key={k.code}>
                      <td className="mono" style={{ width: 88 }}>{k.code}</td>
                      <td>{k.name}</td>
                      <td className="num" style={{ width: 66 }}>{k.qty} {k.unit}</td>
                    </tr>
                  ))}
                  {b.komponenty.length > 5 && (
                    <tr><td colSpan={3} style={{ color: "var(--steel)", fontSize: 12 }}>
                      + ďalších {b.komponenty.length - 5} položiek
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="binlabel">
              <div className="row">
                <span className="qty">{b.dostupnost}<small>kompletných sád</small></span>
                <span className={`tag ${b.dostupnost > 0 ? "ok" : "nula"}`}>
                  {b.dostupnost > 0 ? "dostupné" : "nekompletné"}
                </span>
              </div>
            </div>
          </Link>
          <AddToCartForm kind="bundle" id={b.id} ariaLabel="Počet sád" />
        </article>
      ))}
    </div>
  );
}

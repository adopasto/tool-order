"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import type { Kontext } from "@/lib/types";

const SKLAD_ROLES = ["storekeeper", "buyer", "admin"];
const SPRAVA_ROLES = ["storekeeper", "admin"];
const DASHBOARD_ROLES = ["buyer", "admin"];

function isActive(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export default function AppChrome({ initial, children }: { initial: Kontext | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const [k, setK] = useState<Kontext | null>(initial);

  useEffect(() => {
    // Vzdy refetchni, aj na prvom mounte - SSR render (initial) sa moze
    // pretrhnut s Auth.js cookie tesne po signIn()/signOut() redirecte
    // (novy request stihne prist skor, nez sa cookie skutocne zapise),
    // takze render pouzije initial len ako medzistav do prveho useEffectu.
    let cancelled = false;
    function refetch() {
      fetch("/api/kontext", { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => { if (!cancelled) setK(data); })
        .catch(() => {});
    }
    refetch();
    // Server Action casto presmeruje spat na tu istu stranku (napr. pridanie
    // do kosika na /katalog) - pathname sa tak nezmeni. KontextRefresher vo
    // formulari v takom pripade vyvola tuto udalost, aby sa flash/pocitadla
    // aktualizovali aj bez zmeny URL.
    window.addEventListener("naradie:kontext-refresh", refetch);
    return () => { cancelled = true; window.removeEventListener("naradie:kontext-refresh", refetch); };
  }, [pathname]);

  const user = k?.user ?? null;

  const navKatalog = user && (isActive(pathname, "/katalog") || pathname.startsWith("/produkt/") || pathname.startsWith("/balik/"));
  const navSklad = pathname === "/sklad" || (pathname.startsWith("/sklad/") && !pathname.startsWith("/sklad/doobjednat"));
  const navDoobjednat = pathname.startsWith("/sklad/doobjednat");

  return (
    <>
      {user && (
        <header className="topbar">
          <div className="topbar-in">
            <Link className="brand" href="/katalog">
              Sklad náradia<small>NEWAYS Slovakia, a.s.</small>
            </Link>
            <nav className="nav">
              {DASHBOARD_ROLES.includes(user.role) && (
                <>
                  <Link href="/prehlad" className={isActive(pathname, "/prehlad") ? "active" : ""}>Prehľad</Link>
                  <span className="nav-sep" />
                </>
              )}
              <Link href="/katalog" className={navKatalog ? "active" : ""}>Katalóg</Link>
              <Link href="/ziadanky" className={isActive(pathname, "/ziadanky") ? "active" : ""}>
                Žiadanky{!!k!.naSchvalenie && <span className="badge">{k!.naSchvalenie}</span>}
              </Link>
              {SKLAD_ROLES.includes(user.role) && (
                <>
                  <span className="nav-sep" />
                  <Link href="/sklad" className={navSklad ? "active" : ""}>Sklad</Link>
                  <Link href="/sklad/doobjednat" className={navDoobjednat ? "active" : ""}>
                    Doobjednať{!!k!.alertCount && <span className="badge">{k!.alertCount}</span>}
                  </Link>
                  <Link href="/dodavatelia" className={isActive(pathname, "/dodavatelia") ? "active" : ""}>Dodávatelia</Link>
                </>
              )}
              {SPRAVA_ROLES.includes(user.role) && (
                <>
                  <span className="nav-sep" />
                  <Link href="/sprava" className={isActive(pathname, "/sprava") ? "active" : ""}>Správa</Link>
                </>
              )}
            </nav>
            <Link href="/kosik" className="cart-btn" aria-label="Košík">
              Košík{!!k!.cartCount && <span className="badge">{k!.cartCount}</span>}
            </Link>
            <ThemeToggle />
            <div className="who">
              <b>{user.full_name}</b>
              {user.roleLabel}{user.cost_center ? ` · ${user.cost_center}` : ""}
              <form action="/api/logout" method="post" style={{ display: "inline" }}>
                <button className="linkbtn" type="submit">Odhlásiť</button>
              </form>
            </div>
          </div>
        </header>
      )}

      <main className="wrap">
        {k?.flash && <div className="flash">{k.flash}</div>}
        {children}
      </main>

      {user && (
        <footer className="paticka">
          Objednávky náradia <span className="mono">v{k!.verzia}</span> · NEWAYS Slovakia, a.s.
        </footer>
      )}
    </>
  );
}

"use client";

import Link from "next/link";

/** Mirror views/chyba.ejs. */
export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  return (
    <div style={{ maxWidth: 520, margin: "8vh auto" }}>
      <div className="eyebrow">Nepodarilo sa pokračovať</div>
      <h1 style={{ marginBottom: 10 }}>Akciu nemožno dokončiť</h1>
      <div className="panel">
        <div className="panel-b">
          <p style={{ margin: "0 0 14px" }}>
            {error.message || "Neočakávaná chyba aplikácie. Skúste akciu zopakovať."}
          </p>
          <Link className="btn sec" href="/katalog">Späť do katalógu</Link>
        </div>
      </div>
    </div>
  );
}

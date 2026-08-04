"use client";

import { useState } from "react";

/**
 * Formular "Do kosika" - pouziva sa v katalogu, na karte polozky/balika aj v
 * zozname. Zamerne klientsky fetch namiesto Server Action: pridanie takmer
 * vzdy vedie spat na tu istu stranku, takze by sa cez redirect() nezmenilo
 * URL a topbar (kosik, flash) by sa neobnovil bez rucneho refreshu. Priamy
 * fetch nikam nenaviguje, len po odpovedi vyvola udalost, na ktoru pocuva
 * AppChrome a hned si dotiahne cerstvy stav.
 */
export default function AddToCartForm({
  kind, id, className = "addbox", label = "Do košíka", ariaLabel = "Množstvo",
}: {
  kind: "item" | "bundle"; id: number;
  className?: string; label?: string; ariaLabel?: string;
}) {
  const [qty, setQty] = useState(1);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      await fetch("/api/kosik/pridat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, id, qty }),
      });
    } finally {
      setPending(false);
      window.dispatchEvent(new Event("naradie:kontext-refresh"));
    }
  }

  return (
    <form className={className} onSubmit={handleSubmit}>
      <input
        type="number" name="qty" value={qty} min={1} step={1} aria-label={ariaLabel}
        onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
      />
      <button className="btn sm" type="submit" disabled={pending}
        style={{ flex: className === "addbox" ? 1 : undefined }}>
        {label}
      </button>
    </form>
  );
}

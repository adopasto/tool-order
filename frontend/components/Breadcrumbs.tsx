import Link from "next/link";

export type Drobka = { text: string; href?: string };

/** Drobckova navigacia - vzdy vidno, kde clovek je. Mirror .drobky v app.css / head.ejs. */
export default function Breadcrumbs({ items }: { items: Drobka[] }) {
  if (!items.length) return null;
  return (
    <nav className="drobky">
      {items.map((d, i) => (
        <span key={i} style={{ display: "contents" }}>
          {d.href ? <Link href={d.href}>{d.text}</Link> : <span>{d.text}</span>}
          {i < items.length - 1 && <i>›</i>}
        </span>
      ))}
    </nav>
  );
}

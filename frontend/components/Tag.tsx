export type Stav = "ok" | "nizka" | "nula";

const LABELS: Record<Stav, string> = { ok: "v poriadku", nizka: "nízka", nula: "vypredané" };
const LABELS_SKLAD: Record<Stav, string> = { ok: "na sklade", nizka: "nízka zásoba", nula: "vypredané" };

export default function Tag({ stav, variant = "katalog" }: { stav: Stav; variant?: "katalog" | "sklad" }) {
  const labels = variant === "sklad" ? LABELS_SKLAD : LABELS;
  return <span className={`tag ${stav}`}>{labels[stav]}</span>;
}

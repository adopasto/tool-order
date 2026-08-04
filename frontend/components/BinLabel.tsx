import Tag from "./Tag";
import type { Stav } from "./Tag";

/** Regalova etiketa so stavom + ukazovatel signalnej zasoby. Mirror .binlabel/.gauge v app.css. */
export default function BinLabel({
  stockQty, unit, reorderPoint, stav, legend, variant = "sklad",
}: {
  stockQty: number; unit: string; reorderPoint: number; stav: Stav; legend?: string;
  variant?: "katalog" | "sklad";
}) {
  const max = Math.max(stockQty, reorderPoint * 2, 1);
  const fill = Math.min(100, (stockQty / max) * 100);
  const mark = Math.min(100, (reorderPoint / max) * 100);
  return (
    <div className="binlabel">
      <div className="row">
        <span className="qty">
          {stockQty}
          <small>{unit}</small>
        </span>
        <Tag stav={stav} variant={variant} />
      </div>
      <div className="gauge">
        <i className={stav} style={{ width: `${fill}%` }} />
        <b style={{ left: `${mark}%` }} title="Signálna zásoba" />
      </div>
      {legend && <div className="gauge-legend">{legend}</div>}
    </div>
  );
}

/** Miniatura polozky. path = image_path alebo null, kod = kod polozky. Mirror views/partials/mini.ejs. */
export default function Mini({ path, kod }: { path: string | null; kod: string }) {
  if (path) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="mini" src={`/api/foto/${encodeURIComponent(path)}`} alt="" loading="lazy" />;
  }
  return <span className="mini mini-nic">{kod.slice(0, 3)}</span>;
}

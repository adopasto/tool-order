import { redirect } from "next/navigation";

/** Stara adresa nech nekonci na 404 - mirror routes/warehouse.js. */
export default async function SkladKartaRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/produkt/${id}`);
}

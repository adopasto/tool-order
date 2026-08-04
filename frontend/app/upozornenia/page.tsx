import { redirect } from "next/navigation";

/** Stara adresa nech nekonci na 404 - mirror routes/warehouse.js. */
export default function UpozornaniaRedirect() {
  redirect("/sklad/doobjednat");
}

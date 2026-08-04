import { cache } from "react";
import { apiRead } from "./api";
import type { Kontext } from "./types";

/**
 * React cache() zdedupuje volania v ramci jedneho requestu - viacero
 * Server Componentov (layout + jednotlive stranky) si tak moze pytat
 * kontext (user/role/pocitadla) bez opakovaneho volania backendu.
 */
export const getKontext = cache(async (): Promise<Kontext> => apiRead<Kontext>("/kontext"));

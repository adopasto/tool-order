import { NextResponse } from "next/server";
import { signOut } from "@/auth";
import { BACKEND_URL } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Odhlasenie - vlastna POST route okolo Auth.js signOut(), aby sa obisla
 * MissingCSRF chyba pri plain HTML form POSTe na default NextAuth signout
 * (mirror neways-tooling/frontend/app/api/logout/route.ts).
 *
 * Najprv (best-effort) vycisti FastAPI session - flash spravu (kosik uz je
 * v DB viazany na usera, session sa ho netyka) - volaním backend /odhlasenie
 * s prichadzajucim cookie. Dolezite: Set-Cookie z tejto odpovede treba
 * preposlat do prehliadaca (predtym sa tu zahadzoval), inak by session
 * cookie ostal nezmeneny.
 */
export async function POST(req: Request) {
  const outHeaders = new Headers({ Location: "/prihlasenie" });

  try {
    const cookie = req.headers.get("cookie");
    const res = await fetch(`${BACKEND_URL}/odhlasenie`, {
      method: "POST",
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
    });
    const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
    for (const raw of anyHeaders.getSetCookie?.() ?? []) outHeaders.append("set-cookie", raw);
  } catch {
    // Best-effort - neblokuj odhlasenie, ak backend nie je dostupny.
  }

  try {
    await signOut({ redirect: false });
  } catch {
    // Best-effort - Auth.js niekedy hodi chybu bez session cookie.
  }

  return new NextResponse(null, { status: 303, headers: outHeaders });
}

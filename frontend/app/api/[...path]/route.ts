import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

export const dynamic = "force-dynamic";

/**
 * Genericky reverse-proxy na FastAPI backend. Pouziva ho prehliadac priamo
 * (napr. <img src="/api/foto/...">, PDF priloha ponuky) a klientske komponenty
 * (napr. AppChrome kontext), takze Cookie ide dnu a Set-Cookie von uplne
 * transparentne - ziadne rucne parsovanie, len presmerovanie hlaviciek.
 */
async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${BACKEND_URL}/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");

  // req.cookies (NextRequest.cookies) dekoduje hodnoty rovnako, ako ich Next
  // pri cookies().set() zakoduje (encodeURIComponent) - surovy req.headers
  // "cookie" by poslal este zakodovanu hodnotu a itsdangerous podpis backendu
  // by neprešiel overením. Preto Cookie hlavičku skladáme z dekódovaného storu.
  const cookieHeader = req.cookies.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
  if (cookieHeader) headers.set("cookie", cookieHeader);
  else headers.delete("cookie");

  // X-Neways-User nesie identitu pre FastAPI (pozri backend/app/deps.py).
  // Najprv zahodit hociktoru hodnotu poslanu priamo klientom - inak by si
  // ktokolvek vedel hlavicku sfalsovat a vydavat sa za ineho pouzivatela -
  // a vzdy ju znova vytvorit z overenej Auth.js session na serveri.
  headers.delete("x-neways-user");
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (email) headers.set("x-neways-user", email);

  const hasBody = !["GET", "HEAD"].includes(req.method);

  const res = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    ...(hasBody ? { duplex: "half" } : {}),
    cache: "no-store",
    redirect: "manual",
  } as RequestInit);

  const outHeaders = new Headers(res.headers);
  outHeaders.delete("content-encoding");
  outHeaders.delete("transfer-encoding");

  return new NextResponse(res.body, { status: res.status, headers: outHeaders });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };

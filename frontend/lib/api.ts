import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, data: any) {
    super(pickMessage(data));
    this.status = status;
    this.data = data;
  }
}

function pickMessage(data: any): string {
  if (data && typeof data.error === "string") return data.error;
  if (data && typeof data.detail === "string") return data.detail;
  return "Chyba API";
}

async function buildCookieHeader(): Promise<string> {
  const store = await cookies();
  return store.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
}

/** E-mail z Auth.js session - jediny zdroj identity, ktory FastAPI dostava
 * (hlavicka X-Neways-User). Klient tuto hlavicku nikdy neposiela priamo -
 * doFetch() ju tu vzdy vlozi/prepise podla aktualnej session. */
async function currentUserEmail(): Promise<string | undefined> {
  const session = await auth();
  return session?.user?.email?.toLowerCase();
}

async function doFetch(path: string, init: RequestInit): Promise<Response> {
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const email = await currentUserEmail();
  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body && !isFormData ? { "content-type": "application/json" } : {}),
      ...(init.headers as Record<string, string> | undefined),
      cookie: await buildCookieHeader(),
      ...(email ? { "x-neways-user": email } : {}),
    },
    cache: "no-store",
  });
}

async function parseBody(res: Response): Promise<any> {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function relaySetCookie(res: Response): Promise<void> {
  const store = await cookies();
  const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
  const raws = anyHeaders.getSetCookie ? anyHeaders.getSetCookie() : [];
  for (const raw of raws) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    store.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 8 * 60 * 60,
    });
  }
}

/**
 * Cita data zo Server Componentu (stranky). cookies().set() tu NIE JE povolene
 * (Next.js to zakazuje mimo Server Action / Route Handler), takze Set-Cookie sa
 * nepreposiela - session cookie tak ma pevnu 8h platnost bez "rolling"
 * predlzovania, presne ako povodny express-session bez rolling:true.
 */
export async function apiRead<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await doFetch(path, init);
  const data = await parseBody(res);
  if (res.status === 401) redirect("/prihlasenie");
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

/**
 * Vola sa zo Server Action alebo Route Handler - tam Next.js dovoli menit
 * cookies, takze Set-Cookie z backendu (prihlasenie, zmena kosika, flash) sa
 * korektne prenesie do prehliadaca.
 */
export async function apiAction<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await doFetch(path, init);
  await relaySetCookie(res);
  const data = await parseBody(res);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export { BACKEND_URL };

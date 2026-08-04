import { redirect } from "next/navigation";
import { apiRead } from "@/lib/api";
import { getSession, signIn } from "@/auth";

type Demo = { email: string; full_name: string; role: string };

const ENTRA = process.env.AUTH_MODE === "entra";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session?.user) redirect("/katalog");

  const sp = await searchParams;
  const chyba = sp.error === "domain-not-allowed"
    ? "Tento e-mail nepatrí do firemnej domény NEWAYS."
    : sp.error || null;

  const data = await apiRead<{ demo: Demo[] }>("/prihlasenie");

  return (
    <div className="login">
      <div className="eyebrow" style={{ textAlign: "center", marginBottom: 6 }}>NEWAYS Slovakia, a.s.</div>
      <h1 style={{ textAlign: "center" }}>Objednávky náradia</h1>
      <p className="sub" style={{ textAlign: "center" }}>
        {ENTRA ? "Prihláste sa firemným Microsoft kontom." : "Lokálny vývoj – prihláste sa e-mailom, bez hesla."}
      </p>

      <div className="panel">
        <div className="panel-b">
          {chyba && <div className="flash" style={{ borderLeftColor: "var(--zero)" }}>{chyba}</div>}

          {ENTRA ? (
            <form
              action={async () => {
                "use server";
                await signIn("microsoft-entra-id", { redirectTo: "/katalog" });
              }}
            >
              <button className="btn" type="submit" style={{ width: "100%" }}>Prihlásiť sa cez Microsoft</button>
            </form>
          ) : (
            <form
              action={async (formData: FormData) => {
                "use server";
                const email = String(formData.get("email") || "");
                await signIn("dev-login", { email, redirectTo: "/katalog" });
              }}
            >
              <div className="field">
                <label htmlFor="email">E-mail</label>
                <input type="email" id="email" name="email" autoFocus autoComplete="email" required
                  placeholder="vyroba@example.com" />
              </div>
              <button className="btn" type="submit" style={{ width: "100%" }}>Prihlásiť sa (dev)</button>
            </form>
          )}
        </div>
      </div>

      {!ENTRA && (
        <div className="panel" style={{ marginTop: 14 }}>
          <div className="panel-b">
            <div className="eyebrow" style={{ marginBottom: 8 }}>Existujúce kontá (dev bez hesla)</div>
            <div className="demo">
              {data.demo.map((d) => (
                <div key={d.email}>{d.email.padEnd(24, " ")} {d.full_name} – {d.role}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

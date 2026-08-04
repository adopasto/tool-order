import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";

/**
 * Auth.js v5 setup - mirror neways-tooling/frontend/auth.ts.
 *
 * FastAPI nikdy nerieši heslo - jediné, čo backend potrebuje, je e-mail
 * prihláseného používateľa (posiela sa v hlavičke X-Neways-User, pozri
 * lib/api.ts a app/api/[...path]/route.ts). Rolu a stredisko si backend
 * dohľadá sám v tabuľke `users`.
 *
 * `AUTH_MODE=entra` prepína na skutočný Microsoft Entra ID provider - keď
 * nie je nastavený (lokálny vývoj bez Entra App Registration), zaregistruje
 * sa len `dev-login` (zadáš ľubovoľný e-mail, žiadne heslo).
 */
const useEntra =
  process.env.AUTH_MODE === "entra" &&
  !!process.env.AZURE_AD_CLIENT_ID &&
  !!process.env.AZURE_AD_CLIENT_SECRET &&
  !!process.env.AZURE_AD_TENANT_ID;

const ALLOWED_DOMAINS = ["newayselectronics.com", "newayselectronics.ai"] as const;

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: useEntra
    ? [
        MicrosoftEntraID({
          clientId: process.env.AZURE_AD_CLIENT_ID!,
          clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
          issuer: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0`,
        }),
      ]
    : [
        // DEV-ONLY BYPASS - registruje sa len ked AUTH_MODE nie je "entra"
        // (t.j. chybaju realne Entra credentials). Umoznuje prihlasenie
        // lubovolnym e-mailom bez Microsoft konta, len na lokalny vyvoj.
        Credentials({
          id: "dev-login",
          name: "Dev login (local only)",
          credentials: { email: { label: "Email", type: "email" } },
          async authorize(credentials) {
            const email = (credentials?.email as string | undefined)?.trim().toLowerCase();
            if (!email) return null;
            return { id: email, email, name: email.split("@")[0] };
          },
        }),
      ],
  pages: { signIn: "/prihlasenie", error: "/prihlasenie" },
  callbacks: {
    async jwt({ token, user, profile }) {
      if (user || profile) {
        const p = (profile ?? {}) as Record<string, unknown>;
        const email = (
          (user?.email as string | undefined) ??
          (p.email as string | undefined) ??
          (p.upn as string | undefined) ??
          (p.preferred_username as string | undefined) ??
          ""
        ).toLowerCase();
        if (email) token.email = email;
        const name = (user?.name as string | undefined) ?? (p.name as string | undefined);
        if (name) token.name = name;
      }
      return token;
    },
    async signIn({ user, profile, account }) {
      // Dev-only bypass provider - bez domenoveho obmedzenia.
      if (account?.provider === "dev-login") return true;
      const p = (profile ?? {}) as Record<string, unknown>;
      const rawEmail =
        (user.email as string | undefined) ??
        (p.email as string | undefined) ??
        (p.upn as string | undefined) ??
        (p.preferred_username as string | undefined) ??
        "";
      const email = rawEmail.trim().toLowerCase();
      if (!email) return false;
      const domain = email.split("@")[1] ?? "";
      if (!(ALLOWED_DOMAINS as readonly string[]).includes(domain)) {
        return `/prihlasenie?error=domain-not-allowed`;
      }
      return true;
    },
    async session({ session, token }) {
      if (session.user) {
        if (typeof token.email === "string") session.user.email = token.email;
        if (typeof token.name === "string") session.user.name = token.name;
      }
      return session;
    },
  },
});

/** Server-side helper - vrati aktualnu Auth.js session alebo null.
 * Pouzivat len v Server Components / Server Actions / Route Handlers. */
export async function getSession() {
  return auth();
}

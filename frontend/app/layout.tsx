import "./globals.css";
import AppChrome from "@/components/AppChrome";
import { getKontext } from "@/lib/kontext";

export const metadata = { title: "Sklad náradia" };

/** Nastaví data-theme skôr, než sa čokoľvek vykresli - inak by stránka na
 * zlomok sekundy zablikala v opačnom režime, než aký si používateľ zvolil. */
const NO_FLASH_THEME_SCRIPT = `(function(){try{
  var t = localStorage.getItem('theme');
  if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
} catch (e) {}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initial = await getKontext().catch(() => null);
  return (
    <html lang="sk" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body>
        <AppChrome initial={initial}>{children}</AppChrome>
      </body>
    </html>
  );
}

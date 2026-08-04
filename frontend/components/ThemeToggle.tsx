"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // localStorage nemusí byť dostupný (napr. private mode) - nevadí,
    // volba sa len nezapamätá do dalšej navstevy.
  }
}

/** Prepínač tmavý/svetlý režim v topbar. Pociatocny stav precita atribut,
 * ktory uz nastavil inline skript v layout.tsx (pred vykreslenim - ziadne
 * zablikanie). */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label="Zmeniť farebný režim"
      title={theme === "dark" ? "Prepnúť na svetlý režim" : "Prepnúť na tmavý režim"}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}

"""Vsetko sa da prepisat cez premenne prostredia - ziadny .env subor netreba."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/

PORT = int(os.environ.get("PORT", "8000"))

# Ak appku nasadis na portal pod podadresarom (napr. https://portal.../naradie),
# nastav BASE_PATH=/naradie. Lokalne nechaj prazdne.
BASE_PATH = os.environ.get("BASE_PATH", "")

DB_PATH = Path(os.environ.get("DB_PATH", BASE_DIR.parent / "data" / "naradie.db"))

# Fotky polozek. Subor sa vola podla kodu polozky (NAR-001.jpg),
# takze priecinok sa da naplnit aj hromadne mimo aplikacie.
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", BASE_DIR.parent / "data" / "uploads" / "items"))

SESSION_SECRET = os.environ.get("SESSION_SECRET", "zmen-ma-v-produkcii")

# Identitu rieši Next.js (Auth.js - Microsoft Entra ID alebo lokalny dev
# e-mail bypass) a na kazdom requeste ju posiela v tejto hlavicke (pozri
# frontend/app/api/[...path]/route.ts a frontend/lib/api.ts - hlavicku vzdy
# prepisu hodnotou z Auth.js session, takze sa neda sfalsovat od klienta).
# FastAPI heslo neriesi vobec, len najde pouzivatela v users podla e-mailu.
HEADER_AUTH_NAME = os.environ.get("HEADER_AUTH_NAME", "x-neways-user")

# Ak sa appka bude zobrazovat v iframe portalu, sem daj jeho origin.
FRAME_ANCESTOR = os.environ.get("FRAME_ANCESTOR", "")

# Posta: 'file' = .eml subory do data/mail (lokalny test), 'smtp' = realne odoslanie.
MAIL_MODE = os.environ.get("MAIL_MODE", "file")
MAIL_FROM = os.environ.get("MAIL_FROM", "naradie@newayselectronics.com")
# Komu chodia upozornenia na nizku zasobu (interne, nie dodavatelom).
MAIL_ALERTS = os.environ.get("MAIL_ALERTS", "sklad@newayselectronics.com").split(",")

# SMTP server pre MAIL_MODE=smtp. SMTP_USE_SSL=1 pre implicitne TLS (obvykle
# port 465), inak sa pri porte 587/25 pouzije STARTTLS (moze sa vypnut
# SMTP_STARTTLS=0 pre nezabezpecene interne relay bez sifrovania).
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_USE_SSL = os.environ.get("SMTP_USE_SSL") == "1"
SMTP_STARTTLS = os.environ.get("SMTP_STARTTLS", "1") != "0"

# Hodina, kedy sa posiela denny suhrn otvorenych upozorneni.
DIGEST_HOUR = int(os.environ.get("DIGEST_HOUR", "6"))

# Frontend origin(y) - pre CORS (dev: Next.js na inom porte).
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")

MAIL_DIR = DB_PATH.parent / "mail"
QUOTES_DIR = DB_PATH.parent / "quotes"

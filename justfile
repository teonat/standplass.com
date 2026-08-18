# Set up a Python venv and install scraper dependencies
init:
    python3 -m venv .venv
    .venv/bin/pip install -r .github/scripts/requirements.txt
    @echo ""
    @echo "  Venv ready. Activate with: source .venv/bin/activate"
    @echo ""

# Incremental sync, felt -- current year + a rolling 28-day window only
sync-felt:
    python3 .github/scripts/scrape_stevneresultater.py

# Full sync, felt -- every year from 2021, resets processedIds
sync-felt-full:
    FULL_SCAN=true python3 .github/scripts/scrape_stevneresultater.py

# Full sync, felt, for one specific year -- e.g. `just sync-felt-year 2023`
sync-felt-year year:
    FULL_SCAN=true YEAR={{year}} python3 .github/scripts/scrape_stevneresultater.py

# Incremental sync, bane -- current year + a rolling 28-day window only
sync-bane:
    python3 .github/scripts/scrape_bane.py

# Full sync, bane -- every year from 2021, resets processedIds
sync-bane-full:
    FULL_SCAN=true python3 .github/scripts/scrape_bane.py

# Full sync, bane, for one specific year -- e.g. `just sync-bane-year 2023`
sync-bane-year year:
    FULL_SCAN=true YEAR={{year}} python3 .github/scripts/scrape_bane.py

# Local dev server for public/, with the same /felt -> /felt.html rewrite Cloudflare does in production
start:
    python3 dev-server.py

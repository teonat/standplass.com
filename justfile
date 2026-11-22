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

# Incremental result-file parse -- current + previous year, fresh files only
parse-details:
    python3 .github/scripts/parse_result_files.py

# Full result-file parse -- every year from 2021 (backfill; resumable)
parse-details-full:
    FULL_SCAN=true python3 .github/scripts/parse_result_files.py

# Full result-file parse for one specific year -- e.g. `just parse-details-year 2023`
parse-details-year year:
    FULL_SCAN=true YEAR={{year}} python3 .github/scripts/parse_result_files.py

# ETag freshness sweep -- re-parse result files replaced behind the same URL
parse-details-sweep:
    SWEEP=true python3 .github/scripts/parse_result_files.py

# Local dev server for public/, with the same /felt -> /felt.html rewrite Cloudflare does in production
start:
    python3 dev-server.py

# The consumer pages load embed.js and their data cross-origin from the dev
# server, so `just start` must be running on :8800; ?origin=... points the
# rig at another deployment instead (e.g. https://standplass.com).
# Serves embed-check/ -- a hub index plus one page per embed case -- on :8890.
embed-check:
    @echo "  embed-check: http://localhost:8890  (needs 'just start' on :8800)"
    python3 -m http.server 8890 --directory embed-check

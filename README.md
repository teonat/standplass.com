# Standplass

Open, embeddable competition results for Norwegian shooting clubs, scraped
from skyting.no / the NSF API. MIT-licensed.

## What this is

standplass.com hosts result-list pages (felt, bane, and more to come) that
can be:
- browsed directly, or
- embedded in another site via an iframe (see `/public/embed.js`).

## Deployment

Deployed via Cloudflare Workers Builds (git integration) — every push to
`main` is deployed automatically. No manual `wrangler deploy` step.

## Data

`public/data/felt/{year}.json` and `public/data/bane/{year}.json` are
updated daily by `.github/workflows/scrape-felt.yml` and `scrape-bane.yml`,
which run `.github/scripts/scrape_stevneresultater.py` / `scrape_bane.py`.

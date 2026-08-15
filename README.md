# Standplass

Open, embeddable competition results for Norwegian shooting clubs, scraped
from skyting.no / the NSF API. MIT-licensed.

## What this is

standplass.com hosts result-list pages (felt, bane, and more to come) that
can be browsed directly, or embedded in another site as a custom element.

## Embedding

Drop the element and one script tag into your page — nothing to install, no
rendering code to maintain on your side:

```html
<standplass-results view="felt">
  <p>Laster resultater… <a href="https://standplass.com/felt">Se på standplass.com</a></p>
</standplass-results>
<script src="https://standplass.com/embed.js"></script>
```

The element renders into a Shadow DOM, so standplass's styles and your
page's styles stay out of each other's way. Its content is replaced once
loaded — put a link inside as a fallback for visitors where the script
doesn't load.

Attributes:
- `view` (required) — `felt` or `bane`.
- `klubb` — show only results for clubs matching this name. Omit it to show
  every club's results.
- `club` — brand colour theme.
- `mode` — `light` or `dark`. Follows the visitor's OS preference if unset.
- `sync-url` — opt in to reflecting filter state in your page's URL. Off by
  default, so the element never touches your address bar unasked.
- `id` — required only if you place more than one element on the same page.

The "Opprett innebygging" button on any results page generates this snippet
with the filters you currently have applied.

## Deployment

Deployed via Cloudflare Workers Builds (git integration) — every push to
`main` is deployed automatically. No manual `wrangler deploy` step.

## Data

`public/data/felt/{year}.json` and `public/data/bane/{year}.json` are
updated daily by `.github/workflows/scrape-felt.yml` and `scrape-bane.yml`,
which run `.github/scripts/scrape_stevneresultater.py` / `scrape_bane.py`.

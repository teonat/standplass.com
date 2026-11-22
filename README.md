# Standplass

Open, embeddable competition results for Norwegian shooting clubs, scraped
from skyting.no / the NSF API. MIT-licensed.

## What this is

standplass.com hosts result-list pages (feltskyting, baneskyting,
terminliste and more) that can be browsed directly, or embedded in another
site as a custom element.

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
- `view` (required) — `felt`, `bane` or `terminliste`.
- `compact` — terminliste only: render a compact upcoming-competitions
  widget for the `klubb` you set, instead of the full page.
- `klubb` — show only results for clubs matching this name. Omit it to show
  every club's results.
- `club` — brand colour theme.
- `mode` — `light` or `dark`. Follows the visitor's OS preference if unset.
- `sync-url` — opt in to reflecting filter state in your page's URL. Off by
  default, so the element never touches your address bar unasked.
- `id` — required only if you place more than one element on the same page.

The "Opprett innebygging" button on the felt, bane and terminliste pages
generates this snippet, carrying over your current `klubb`, `club` and
`mode` settings — other filters are not carried.

The remaining pages (klubb, nasjonalt, norgesfelt, klubbstatistikk,
mesterskap) are standalone-only for now; making them embeddable is
planned.

## Deployment

Deployed via Cloudflare Workers Builds (git integration) — every push to
`main` is deployed automatically. No manual `wrangler deploy` step.

## Data

### Felt and bane results

`.github/workflows/scrape-felt.yml` and `scrape-bane.yml` scrape the
skyting.no API daily (04:00 and 06:00 UTC) into
`public/data/felt/{year}.json` and `public/data/bane/{year}.json`.

- **Daily** — new competitions with results, plus corrections to
  recently started competitions.
- **On demand** — dry run, full scan, or a single year.

### Norgesfelt

`.github/workflows/scrape-norgesfelt.yml` scrapes norgesfelt.no daily
at 02:00 UTC into `public/data/norgesfelt.json`. If the scrape fails,
the workflow retries itself up to three times.

### Result details

`.github/workflows/parse-details.yml` parses the result PDFs behind
each competition into `public/data/detaljer/` and a per-year
championship index (`mestere-{year}.json` in each branch folder).

- **Daily 08:00 UTC** (after the scrapers) — parses new and updated
  competitions from the current and previous year files.
- **Sundays 09:00 UTC** — re-checks every parsed PDF, in case an
  organizer replaced it behind the same URL.
- **On demand** (workflow dispatch) — full scan, one year, one
  branch, sweep or dry run.

It reads the current and previous year files because that is
everything the scrapers can change: they add new competitions to the
current year, and re-scrape corrections only within 28 days of a
competition's start date — which reaches last year's file only
around New Year. Competitions that have not changed are skipped
without downloading anything.

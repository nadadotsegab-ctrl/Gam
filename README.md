# UltraX

A personal sports-odds research workspace built with React and Vite, with an optional Node server connector for The Odds API. The app opens on Daily props for NBA, NFL, and soccer. Real daily props require a provider account with player-prop coverage. Other tools remain usable with sample or imported markets.

UltraX is an independent reconstruction of a betting analytics workflow. It is not affiliated with OddsJam or any sportsbook. OddsJam inspection was blocked by the cloud environment's network policy (HTTP 403), and the requested REA skill was not available in this workspace. This project does not claim a pixel-perfect copy, proprietary functionality, or access to OddsJam's paid feeds or accounts.

## Run

Requires Node.js **24.5 or newer**. The scripts use Node's `--use-env-proxy` flag to respect the cloud runtime's configured proxy.

For a GitHub checkout or downloaded source ZIP, open a terminal in the folder containing `package.json`, then run:

```sh
npm ci
npm run build
npm start
```

The app serves port **4173**. GitHub source downloads do not include the generated `dist/` build, so the build command is required before the first start. Keep the terminal open while using UltraX. Actual daily props remain unavailable until you configure a provider key as described below.

For cloud development, from the repository directory:

```sh
cd /workspace/Gam
npm ci --cache /workspace/.npm-cache
npm run dev
```

For a local checkout, run `npm ci` without the cloud cache option. The development server normally uses port **5173**; use your host's normal browser or port-access mechanism to open the running service.

Build and run the production server:

```sh
npm run build
npm start
```

`npm start` serves `dist/` and the odds connector on port **4173** by default. Optional `PORT` and `HOST` environment variables override the listener. It reads a local `.env` file if present. The development server also supports the server-side connector. `npm run preview` previews static build output and does not provide the odds API.

These commands run the application; they do not publish or deploy it. Each cloud task already has an isolated checkout, so use the existing repository without creating an additional Git worktree.

## Use the workspace

- **Daily props:** scan today’s future NBA/NFL events and a selected soccer league, compare identical player lines, and rank fresh prices by estimated market EV. Without data access, this page shows connection setup and no picks.
- **Positive EV:** compare offered prices with each market's fair-price reference; inspect prices and a quarter-Kelly stake estimate.
- **Odds screen:** compare sportsbook prices side by side, then filter, search, and sort markets.
- **Arbitrage:** inspect sample two-way markets and calculate balanced stakes. This page always uses its own demonstration fixtures, including when other pages use imported or provider data.
- **Calculators:** calculate arbitrage, expected value, fractional Kelly stakes, and American/decimal odds conversions.
- **Saved picks:** bookmark selections for later review.
- **Bet tracker:** log bets, manually mark them won, lost, or void, and export their net results as CSV. Logging a bet never places a wager.
- **Workspace settings:** change the workspace name, reference bankroll, and displayed odds format.

The overview chart is an illustration, not a record of account performance. EV and Kelly estimates depend on the supplied fair probability; a positive calculation does not guarantee profit. Arbitrage results assume exhaustive opposite outcomes, accepted prices, and matching settlement rules, without fees or limits.

## Import a snapshot

Open **Data source**, then download the example schema or choose a JSON file. An import replaces the active market snapshot; prices remain fixed until another import or provider fetch. Use **Switch back to sample data** to restore the demonstration markets.

The file must contain a `markets` array. This illustrative record is not an actual event listing or sportsbook quote:

```json
{
  "markets": [
    {
      "id": "example-boston-moneyline",
      "sport": "NBA",
      "league": "NBA",
      "event": "Boston Celtics vs. Los Angeles Lakers",
      "selection": "Boston Celtics",
      "market": "Moneyline",
      "startsAt": "2026-10-24T23:30:00Z",
      "odds": { "draftkings": 110, "fanduel": 105 },
      "fairOdds": -105,
      "trend": [100, 105, 110]
    }
  ]
}
```

Supported sports are `NBA`, `NFL`, `MLB`, and `NHL`. Supported book IDs are `draftkings`, `fanduel`, `betmgm`, `caesars`, and `pinnacle`. Use unique market IDs, numeric American odds, and ISO timestamps with a timezone. `fairOdds` supplies the probability reference for EV calculations; it is not inferred from your imported offered prices. `trend` is optional. Imports are limited to 500 markets and a file size below 2 MB. Never include credentials in a snapshot.

## Optional provider connection

The server connector supports **The Odds API v4**, fetching two-outcome `h2h` moneyline markets for NBA, NFL, MLB, or NHL. It maps the five supported sportsbooks to the dashboard schema. Available games and books depend on your subscription and the provider's response.

Set `ODDS_API_KEY` securely in the cloud environment settings, or in a local ignored `.env` file using the variable name shown in `.env.example`. Restart the server after changing it. Keep this key server-side: do not use a `VITE_` prefix or put the key in frontend code, imported files, or Git.

In **Data source**, select a sport and choose **Fetch current odds**. Provider prices are fetched snapshots, not a streaming feed. Refresh manually; the server caches each sport for 60 seconds to reduce quota use. The fair-price reference uses normalized two-way Pinnacle probabilities when available, otherwise an equal-weight consensus of normalized bookmaker probabilities. Both are estimates.

The server needs permitted HTTPS access to `api.the-odds-api.com`. The browser calls the application's own `/api/odds/status` and `/api/odds?sport=NBA` endpoints; the provider key stays on the server. Missing configuration, rejected credentials, provider limits, and connection failures are reported without falling back to pretend live prices.

No provider key was configured during development, so a real authenticated provider request has **not** been validated. The provider adapter and error paths can be tested with fixtures independently. Arbitrage remains sample-only and does not use provider snapshots.

## Daily player props

**A data-provider account is required to get actual daily props.** No real provider account or key was available during implementation. The scanner, error handling, and browser flows were validated with simulated provider responses; no real daily picks or authenticated provider access have been verified. This does not unlock OddsJam’s subscription, models, or data.

The built-in connector uses The Odds API event/player-prop endpoints. Before choosing a plan, confirm its current coverage and quota for all sports, markets, and books you need. Free access across all requested props is not promised. The connector supports:

| Sport | Player markets |
| --- | --- |
| NBA | Points, rebounds, assists, three-pointers made |
| NFL | Passing yards, rushing yards, receiving yards, receptions |
| Soccer | Shots and shots on target in one selected league |

Soccer league choices are EPL, UEFA Champions League, La Liga, MLS, Bundesliga, Serie A, and Ligue 1. These are supported request codes; actual availability depends on the provider. Selecting all sports scans NBA, NFL, and the selected soccer league, with up to 12 upcoming events per sport/league. This is not every soccer league worldwide.

To connect on your Mac:

1. Create a provider account with the required player-prop access and get its API key.
2. In the UltraX folder, copy `.env.example` to `.env`. Edit the plain-text file and put the key after `ODDS_API_KEY=`. Do not put the key in chat, source code, JSON uploads, or a `VITE_` variable.
3. Restart `npm start`. Open **Daily props → Check connection**. A detected key means the server sees a value; a successful scan is still needed to establish actual access.
4. Choose your sports, soccer league, and day timezone. Inspect results and the offered price’s timestamp before recording any bet.

The ranking is a market-price comparison. For every target book, at least two **other** books must supply fresh Over and Under prices for the identical event, player, market, and half-point line. Each reference pair is normalized to remove bookmaker margin; the mean probability estimates EV. The offered book is excluded from its own reference. Integer lines, unmatched markets, stale quotes, next-day events, and started events are excluded. No player-performance, injury, lineup, or minutes-projection model is included.

The board scans on opening and when its sport, league, timezone, or local date changes. Server results are cached for five minutes; displayed snapshots expire after five minutes, while source quotes must be no more than 15 minutes old. Optional refresh every five minutes runs only while this page is open and visible. It is not an email subscription or a background scheduler; closing the app stops browser refresh. Partial coverage and provider failures are shown explicitly. Missing or failed live data is never replaced with invented props.

Open a prop for the same-line sportsbook comparisons, reference books, estimated probability, and quarter-Kelly stake suggestion. Recording a bet creates a manual journal entry and never places a wager. Export the current filtered board as CSV if needed. Price or reference changes during refresh make an old open detail ineligible to log; reopen its current price.

The server exposes `/api/props/status`, `/api/props/leagues`, and `/api/props?sport=NBA&timeZone=America/Denver`. `sport` supports `NBA`, `NFL`, and `SOCCER`; soccer additionally uses `league=soccer_epl` or another supported league. Authentication remains server-side. Missing key returns an explicit 503 response. Provider credentials, plan restrictions, quotas, and actual coverage remain external prerequisites.

## Data and privacy

Saved picks, market snapshots, preferences, daily-prop filter settings, and the bet journal use this browser's local storage. Daily-prop quote snapshots remain in page memory and expire; they are not stored as evergreen picks. There are no user accounts, browser-to-browser sync, sportsbook connections, or real-money wagering. Export CSV before clearing browser data or changing devices; CSV export is a record of bets rather than a restore format. Local browser storage is not an encrypted vault.

The optional provider key is read by the server and used only for upstream odds requests. Imported files do not need to leave the browser. The server has no account authentication or user access control.

## Check the build

```sh
npm test
npm run build
npm run test:e2e
```

Unit tests exercise betting math, snapshot validation, CSV export, settled profit, player-prop matching/ranking, daily freshness/rollover, and server/provider behavior. Playwright exercises browser flows and starts the development server on port 5173 when needed. Playwright defaults to system Chromium at **`/usr/bin/chromium`**. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to your Chromium executable on other machines before running browser tests.

## Automatic player research and preliminary parlay builder

The **Player research** and **Parlay builder** pages are available on the
\`feature/research-parlay-foundation\` branch. Use \`npm ci && npm run build && npm start\`
and visit http://localhost:4173.

**Player research:** Choose NBA, NFL or SOCCER, type part of a player's name,
click **Search player**, then choose a result. The backend looks up public ESPN
team rosters and fetches available game logs, injury listings, and future fixtures.
Data is cached server-side. Supported market averages and historical over/under
hit counts appear automatically, with source links and timestamps. NFL and
especially soccer statistics vary by market and competition. If ESPN cannot
supply or parse a result, the interface reports that limitation rather than
displaying manufactured player statistics. ESPN endpoints are unofficial and
subject to provider availability, licensing, and terms of use; verify usage rights
before making a commercial service.

**Important:** Historical hit rates and bookmaker no-vig consensus are NOT
model-predicted winning percentages. Current injury reports, teammate changes,
expected minutes, matchups, and sportsbook prices are not all comprehensively
verified. Until there is a trained, independently calibrated model and official
availability confirmation, the player verdict remains **INSUFFICIENT DATA**.
No feature guarantees winning bets.

**Parlay builder:** Choose a sport, then **Load live candidates** to query the
existing Odds API provider connector. If real qualifying lines are returned,
you can select legs manually or build a tentative shortlist from market-price
discrepancies while avoiding duplicate event IDs. It shows quoted combined odds
but deliberately does **not** claim a trustworthy combined hit probability or
guarantee profit. Without \`ODDS_API_KEY\` and permitted player-prop markets, it
shows a clear connection error and does not invent selections.

**Free API credit controls:** Copy \`.env.example\` to an ignored \`.env\` file.
\`ODDS_API_FREE_MODE=1\` limits prop scans to one upcoming event and the first
market per scan, disables automatic startup scanning and five-minute refresh,
and requires manual refresh to save credits. Only use \`ODDS_API_FREE_MODE=0\`
after checking your provider plan. This mode does not guarantee that free
access includes player-prop markets. The public ESPN research endpoints need
no Odds API key, but are best-effort and may be rate-limited.

Research API endpoints:
- \`GET /api/research/search?sport=NBA&q=jokic\`
- \`GET /api/research/player?sport=NBA&id=3112335&name=Nikola%20Jokic\`

Run \`npm test\` for statistical functions and mocked provider endpoints, then
\`npm run build\` to validate the React bundle. This is an upgrade to the
existing React/Vite/Node app; no replacement project or new Python runtime is
required for the research interface.


## When Daily Props says "Player-prop data not connected"

This is a missing **provider credential**, not a broken page. You cannot retrieve
real sportsbook player-prop odds without an appropriate provider account and
server-side credential.

There are **two separate workflows**:

1. **No key required:** Open Parlay builder and use the **Build a parlay without
   an API key** section. Enter 2–8 selections and their actual American odds
   to calculate quoted combined payout and potential profit. This tool never
   invents model probabilities. If you used **Data source → Import a market
   snapshot**, those imported markets appear as selectable items, marked
   **not live**. The built-in demo markets do not appear as real recommendations.
2. **Live feed:** Register for a key at https://the-odds-api.com/ and set the
   following values in an ignored \`.env\` file at the project root or in your
   host's server-side environment-variable settings:

   \`\`\`env
   ODDS_API_KEY=YOUR_REAL_KEY
   ODDS_API_FREE_MODE=1
   \`\`\`

   Restart \`npm start\` locally or redeploy your server in the hosting platform,
   then press **Check connection** on Daily Props. Confirm your provider account
   permits the requested sport and player-prop markets. Do not place
   \`ODDS_API_KEY\` in a frontend \`VITE_\` variable, commit it to GitHub, or
   share the key publicly.

On the free odds budget, live scans are manual and limited to one upcoming
event and one player market; many legitimate queries will return no qualifying
positive-EV prop. The manual builder works independently. **Neither workflow
is an injury-aware or statistically validated predictive model**, and no
parlay win probability is claimed.

## Research-first Daily Props and parlay screening

Daily Props retains live cross-book prices, but **no longer ranks props by price discrepancy alone**.
The server now enriches up to 12 candidates per scan with the public ESPN roster,
game-log, injury-listing and schedule feeds. The UI places candidates with more
verified evidence first and displays an evidence checklist in **View prop**.
An event/roster mismatch is marked **BLOCKED** and is excluded from automatic
parlay shortlists.

Research currently checks:
- Athlete's available team roster against both teams in the sportsbook matchup
- Exact prop market game logs, last 5/10/20 historical hit counts and averages
- ESPN's upcoming fixture and the approximate days since last recorded game
- Available player and teammate injury listings, with explicit gaps when no official
  injury clearance or full lineup is available
- Current event/line/quote timestamps and independent sportsbook references

**Not yet verified/modelled:** official game-day active/inactive confirmations,
expected rotations and minutes, teammate usage effects, opponent defensive
efficiency, current play-by-play matchup models, calibrated over/under
probabilities, or joint parlay probabilities. These are named as missing rather
than treated as neutral or assumed favorable. Historical frequency and bookmaker
no-vig consensus do **not** constitute model win probabilities. No bet
automatically receives an OVER/UNDER recommendation until an independently
validated model and verified inputs are connected.

Parlay Builder's *Suggest research shortlist* selects from candidates with
verified matchup roster, fresh price, historical form and verified fixture only.
It avoids repeating the same event, and will decline to generate a shortlist
when too few different games have the required evidence. This is a research
shortlist, never a validated multi-leg wager or a promised winner.

The ESPN endpoints are unofficial and may rate limit or return incomplete data.
The review report provides source links and explicit statuses. Validate
production/commercial licensing before distributing fetched data publicly.


## Independent rolling forecast workbench and historical validation

UltraX now includes an **original** feature/forecast workbench inspired by the
*architecture ideas* discussed in [Sports-EV-Bot](https://github.com/DevanshDaxini/Sports-EV-Bot).
That upstream repository currently does not publish a LICENSE file; **no upstream
implementation, datasets, trained models, or credentials were copied**. Its
self-reported accuracy is not presented as independently verified UltraX accuracy.

### Added for NBA/NFL/soccer research

- League-specific market parsing based on UltraX's existing verified game logs.
- Rolling last-5/10/20 means, last-10 median, longer-term average and
  exponential recency weighting, plus volatility and consistency indicators.
- An interpretable *heuristic projection* in the same stat units as the market;
  its trend is independently compared with the book's quoted side.
- Observed minutes trend, flagged injuries, teammate availability, rest,
  matchup/team identity, source links, bookmaker disagreement and missing
  defensive/pace/rotation features.
- Strictly time-ordered game-log handling and an expanding-window one-game-ahead
  MAE, calculated only when enough earlier games are available.
- Preliminary parlay shortlists require both price and historical trend signals
  to agree, 8+ walk-forward comparisons, sufficient recent data, and validated
  player/fixture records. Otherwise UltraX withholds the shortlist.

**Important distinction:** The rolling score is NOT a fitted XGBoost,
LightGBM, or calibrated probability model. The optional backtester reports
error and research-only realized historical ROI from authentic pregame lines.
**No projected 60%, 80% or 90% winning chances are fabricated**. Whether a
shortlist is profitable cannot be established without historical *real*
sportsbook quotes, their timestamps, a held-out test, and verified pregame
context (especially injury reports).

### Run your own walk-forward audit ($0, Node.js only)

Provide a historical CSV from a source you are licensed to use, with these
columns:

\`\`\`text
event_time,sport,player,market,actual,line,offered_side,american_odds,quoted_at,source_url
\`\`\`

Each row is ONE settled player game/market. **event_time** is the game's
actual start time, **quoted_at** is when the price was available before the
start, and \`actual\` is known only after the game. Use ISO 8601 timestamps.
Game data are always processed in chronological order, grouped by player and
market; each projection sees only earlier games. Duplicate player-market games
are skipped. A missing/late quoted price or missing HTTPS evidence source
excludes the row from betting-result statistics, though it may still be
used as a historical game result. Do **not** fake past odds/lines, synthesize
actual bets from final box scores, or interpret proxy lines as true historical
sportsbook returns.

\`\`\`bash
node scripts/backtest-props.mjs /path/to/authorized-historical-props.csv > backtest.json
\`\`\`

The output includes a final-30%-of-dates holdout MAE, number of verified quote
examples, observed win/loss/push counts where the historical projection agrees
with the offered side, and realized unit-return ROI where possible. This is
exploratory research; it does not train a calibrated probability model, does
not account for all correlations, and cannot promise future wins.

Current ESPN endpoints remain best-effort and unofficial. Commercial
redistribution requires checking the provider terms, and operating with a
free Odds API quota may produce a small or empty Daily Props slate.

## Why Parlay Builder may show only one game

With `ODDS_API_FREE_MODE=1`, UltraX deliberately scans **one upcoming event and
one prop market per manually triggered request** to conserve your API quota.
An Over and an Under on the same player/line are **alternatives**, not two parlay
legs. The Builder now blocks selecting both sides of that exact prop.

Click **Scan first game**, then **Scan next game (uses credits)** to browse
subsequent chronological events. Each click examines only one additional
event and may consume more API credits. No automatic league-wide scan is
performed in free-budget mode. Repeated requests for the same event offset
reuse the server's short-lived cache. The Builder combines active candidate
snapshots from different events and hides snapshots after five minutes.

A research shortlist requires at least two **distinct** games with verified
roster, opponent, price and history; rolling trend agreement; and eight
earlier walk-forward evaluations. Setting five target legs does **not** create
five imaginary selections.

### Early-season baseline

If a player has fewer than 18 parseable current-season games, UltraX attempts
to fetch the **prior season** and extends the research baseline with dated
games from that season (deduplicated by game ID). Reports clearly label the
seasons and current-season game count and flag that prior team roles, minutes,
coaches, and injury context may no longer hold. Missing prior-season data
remain missing: no replacement is invented.

Historical rolling estimates are **not** calibrated win probabilities and
cannot establish that a parlay is profitable or safe.

# Quebec Real Estate Investment Agent

An AI-powered platform that scrapes Quebec plex/revenue property listings, runs a full investment analysis pipeline, and presents the results in a modern dashboard — helping real estate investors quickly identify strong opportunities.

---

## What It Does

1. **Scrapes** listings from Centris, Realtor.ca, and ReMax Quebec
2. **Deduplicates** across sources using MLS number, address, and agent fingerprinting
3. **Analyzes** each property: comparables, financials (cap rate, NOI, cash flow, welcome tax), opportunity score
4. **Generates** a short AI brief (Claude) explaining why a property is or isn't a good deal
5. **Displays** everything in a React dashboard with filters, saved properties, market alerts, and reports

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI + Uvicorn |
| Database | PostgreSQL + PostGIS (via SQLAlchemy async) |
| Migrations | Alembic |
| Scraping | Scrapfly SDK (ASP anti-bot bypass) + BeautifulSoup |
| AI Analysis | Anthropic Claude API |
| Scheduling | APScheduler |
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| Charts | Recharts |
| HTTP Client | Axios + TanStack React Query |

---

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        SCRAPE LAYER                         │
│                                                             │
│  Centris.ca ──┐                                             │
│  Realtor.ca ──┼──► Scrapfly (anti-bot) ──► RawProperty     │
│  ReMax QC  ──┘                                              │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                     DEDUPLICATION LAYER                     │
│                                                             │
│  PropertyDeduplicator                                       │
│  • Match by MLS number                                      │
│  • Match by address + agent fingerprint                     │
│  • Merge fields from multiple sources                       │
│  • Flag needs_reanalysis = True on new/updated              │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      AI PIPELINE (4 STAGES)                 │
│                                                             │
│  Stage 1 ── ComparableFinder                                │
│             Finds similar sold properties nearby            │
│             → median price, value gap, discount %           │
│                                                             │
│  Stage 2 ── FinancialCalculator + CalcEngine                │
│             Cap rate, NOI, GRM, monthly cash flow           │
│             Welcome tax, mortgage estimate                  │
│             Municipal & school tax (Quebec rules)           │
│                                                             │
│  Stage 3 ── OpportunityScorer                               │
│             Score 0–100 across price, income, market        │
│             Categories: strong_opportunity / worth_         │
│             investigating / market_price / not_recommended  │
│                                                             │
│  Stage 4 ── BriefGenerator (Claude claude-opus-4-8)         │
│             2–3 sentence plain-English verdict              │
│             Generated in EN + FR for score ≥ 60            │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                       REACT DASHBOARD                       │
│                                                             │
│  Dashboard   ── Live stats, score breakdown, quick filters  │
│  Properties  ── Filterable grid with score badges           │
│  Property    ── AI Verdict, Financials, Comparables tabs    │
│  Saved       ── Bookmarked properties (localStorage)        │
│  Reports     ── Best deals, price drops, newest listings    │
│  Alerts      ── Rule-based market alert system              │
│  Settings    ── Scrape trigger, pipeline trigger            │
└─────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── agent/              # AI pipeline stages
│   │   │   ├── pipeline.py     # Orchestrates all 4 stages
│   │   │   ├── comparables.py  # Stage 1: comparable finder
│   │   │   ├── calculator.py   # Stage 2: financial metrics
│   │   │   ├── scorer.py       # Stage 3: opportunity score
│   │   │   └── brief.py        # Stage 4: Claude AI brief
│   │   ├── scrapers/
│   │   │   ├── centris.py      # Centris.ca scraper (ASP + JS)
│   │   │   ├── realtor.py      # Realtor.ca JSON API scraper
│   │   │   ├── remax.py        # ReMax Quebec sitemap scraper
│   │   │   ├── deduplicator.py # Cross-source deduplication
│   │   │   └── base.py         # Shared Scrapfly client
│   │   ├── models/             # SQLAlchemy ORM models
│   │   ├── api/routes/         # FastAPI route handlers
│   │   ├── scheduler.py        # APScheduler scrape + pipeline jobs
│   │   ├── scrape_state.py     # Live scrape progress (polled by UI)
│   │   └── main.py             # FastAPI app entry point
│   ├── scripts/
│   │   ├── bulk_scrape.py      # Manual scrape with detail pages
│   │   └── run_pipeline.py     # Manual pipeline run
│   └── alembic/                # DB migrations
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.tsx
│       │   ├── Properties.tsx
│       │   ├── PropertyPage.tsx  # Detail + AI Verdict tabs
│       │   ├── MarketAlerts.tsx
│       │   ├── Reports.tsx
│       │   └── Settings.tsx
│       ├── components/
│       │   ├── Layout.tsx        # Dark sidebar + sticky layout
│       │   └── PropertyCardGrid.tsx
│       └── api.ts                # Axios API client
└── README.md
```

---

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 15+ with PostGIS extension
- [Scrapfly](https://scrapfly.io) API key (free tier: 1000 credits/month)
- [Anthropic](https://console.anthropic.com) API key

### 1. Clone

```bash
git clone https://github.com/Prathikesh/RealEstate-Investment-Agent.git
cd RealEstate-Investment-Agent
```

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Mac/Linux

pip install -r requirements.txt
```

Copy and fill in `.env`:

```bash
cp .env.example .env
```

```env
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/quebec_realestate
SCRAPFLY_API_KEY=scp-live-xxxxxxxxxxxxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxx
APP_SECRET_KEY=your-random-secret
APP_BASE_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000
SCRAPE_INTERVAL_HOURS=6
```

Run DB migrations:

```bash
alembic upgrade head
```

Start the API:

```bash
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Running the Pipeline

### Scrape properties (manual)

```bash
cd backend

# Scrape all 3 sources, 50 properties each (includes detail pages)
python scripts/bulk_scrape.py --centris-target 50 --realtor-target 50 --remax-target 50

# Centris only
python scripts/bulk_scrape.py --centris-only --centris-target 50

# ReMax only
python scripts/bulk_scrape.py --remax-only --remax-target 50
```

> Detail pages fetch taxes, sqft, rental income, bedrooms — essential for accurate AI analysis.

### Run AI analysis pipeline

```bash
python scripts/run_pipeline.py
```

This processes all properties with `needs_reanalysis = True` — running comparables, financial calculator, scorer, and Claude brief generator.

### Automated schedule

The backend runs both jobs automatically via APScheduler every `SCRAPE_INTERVAL_HOURS` hours (default: 6). You can also trigger them manually from the **Settings** page in the dashboard.

---

## Score Categories

| Score | Category | Meaning |
|---|---|---|
| 75–100 | Strong Opportunity | Below market, strong cash flow |
| 50–74 | Worth Investigating | Good metrics, worth a closer look |
| 30–49 | Market Price | Fair price, average returns |
| 0–29 | Not Recommended | Overpriced or poor cash flow |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/properties` | List properties (filterable) |
| GET | `/api/properties/{id}` | Property detail |
| POST | `/api/properties/{id}/reanalyze` | Re-run AI pipeline for one property |
| POST | `/api/admin/scrape` | Trigger scrape job |
| GET | `/api/admin/scrape-status` | Live scrape progress |
| POST | `/api/admin/pipeline` | Trigger pipeline job |

---

## Scrapfly Credit Usage

| Source | Credits per run (50 props) |
|---|---|
| Realtor.ca | ~5 (JSON API, no ASP) |
| Centris | ~350 (ASP + JS render + detail pages) |
| ReMax Quebec | ~55 (sitemap + detail pages, no JS) |

Free tier gives 1000 credits/month. Sufficient for ~2 full scrape cycles per month across all 3 sources.

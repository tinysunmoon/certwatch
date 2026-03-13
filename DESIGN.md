# CertWatch — Detailed Design Document

## Overview

CertWatch is a personal SSL certificate monitoring tool. It tracks domains, displays their certificate expiry status on a dashboard, and sends email alerts before certificates expire — so you can request renewal from the responsible team in time.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend + Backend | Next.js 14 (App Router, TypeScript) | Web app and API routes |
| Database | Supabase (PostgreSQL) | Stores domain records |
| Email | Resend | Sends alert emails |
| Scheduler | Vercel Cron | Runs daily cert checks at 8:00 AM |
| Hosting | Vercel | Deployment and cron execution |

---

## Repository

- **GitHub:** `https://github.com/tinysunmoon/certwatch`
- **Branch:** `main`

---

## Project Structure

```
certwatch/
├── app/
│   ├── page.tsx                  # Dashboard (home page)
│   ├── layout.tsx                # Root layout with metadata
│   ├── globals.css               # Tailwind base styles
│   └── api/
│       ├── domains/
│       │   ├── route.ts          # GET all domains, POST add domain
│       │   └── [id]/
│       │       └── route.ts      # DELETE a domain
│       └── check/
│           └── route.ts          # Re-check all certs + send alerts
├── lib/
│   ├── supabase.ts               # Supabase client + Domain type
│   ├── cert.ts                   # TLS cert expiry fetcher
│   └── email.ts                  # Alert logic + Resend mailer
├── vercel.json                   # Cron schedule config
├── .env.local                    # Environment variables (not committed)
├── REQUIREMENTS.md               # Original product requirements
└── DESIGN.md                     # This document
```

---

## Database Schema

**Provider:** Supabase (PostgreSQL)
**Table:** `domains`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key, auto-generated |
| `domain` | text | Domain name, e.g. `example.com` |
| `valid_from` | date | SSL cert start date (optional, manually entered or null) |
| `expiry_date` | date | SSL cert expiry date |
| `days_remaining` | int | Days until expiry, recalculated on each check |
| `last_checked` | timestamp | When the cert was last checked |
| `created_at` | timestamp | When the domain was added |

**Setup SQL:**
```sql
create table domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  valid_from date,
  expiry_date date,
  days_remaining int,
  last_checked timestamp with time zone,
  created_at timestamp with time zone default now()
);

-- Add valid_from if upgrading from initial schema:
alter table domains add column if not exists valid_from date;
```

---

## Environment Variables

Stored in `.env.local` (never committed to git). Must also be added to Vercel project settings.

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `RESEND_API_KEY` | Resend API key for sending emails |
| `ALERT_EMAIL` | Email address to send alerts to (`tinysunmoon@gmail.com`) |

---

## Features

### 1. Dashboard (`app/page.tsx`)

The home page. Loads all tracked domains from the API and displays them in a table.

**Columns:**
- Domain name
- Valid From (cert start date)
- Expiry Date
- Days Left
- Status badge
- Last Checked
- Remove button

**Status badge logic:**

| Days Remaining | Badge |
|---------------|-------|
| > 30 days | 🟢 Safe |
| 14–30 days | 🟡 Warning |
| < 14 days | 🔴 Critical |
| < 0 (expired) | ⚫ Expired |
| Unknown | Grey — Unknown |

**Actions:**
- **Add Domain** — form at top of page with domain name + optional date fields
- **Check Now** — button in table header, re-checks all certs immediately
- **Remove** — per-row delete with inline confirmation (no modal)

---

### 2. Add Domain Form

Fields:
- **Domain** (required) — text input, e.g. `example.com`
- **Valid From** (optional) — date picker; leave blank to auto-fetch
- **Expiry Date** (optional) — date picker; leave blank to auto-fetch

**Behaviour:**
- If Expiry Date is left blank → the app opens a TLS connection to the domain and reads the cert automatically
- If Expiry Date is entered manually → no TLS fetch; manual values are used directly (useful for internal/private domains)
- After saving, if the cert is already at or below a threshold, an alert email is sent immediately

---

### 3. Delete Domain

- Each row has a **Remove** link
- Clicking it shows inline **Confirm / Cancel** without a modal
- Confirmed deletion removes the row from Supabase and refreshes the dashboard

---

### 4. Check Now (Manual Re-check)

- Calls `POST /api/check`
- Re-fetches SSL cert for every tracked domain via TLS
- Updates `expiry_date`, `days_remaining`, `last_checked` in Supabase
- Sends alert emails if a domain hits an exact threshold (30, 14, or 7 days)
- Dashboard refreshes automatically after completion

---

### 5. Auto Daily Check (Vercel Cron)

Configured in `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/check",
      "schedule": "0 8 * * *"
    }
  ]
}
```

- Runs every day at **8:00 AM UTC**
- Calls the same `GET /api/check` endpoint as the manual check
- No user action required

---

## API Routes

### `GET /api/domains`
Returns all tracked domains ordered by `created_at` descending.

**Response:** Array of `Domain` objects.

---

### `POST /api/domains`
Adds a new domain.

**Request body:**
```json
{
  "domain": "example.com",
  "valid_from": "2025-01-01",   // optional
  "expiry_date": "2026-01-01"   // optional
}
```

**Logic:**
1. If `expiry_date` is provided → calculate `days_remaining` from it
2. If not → open TLS connection to domain, read cert, extract expiry
3. Insert record into Supabase
4. If `days_remaining` triggers an alert → send email immediately

**Response:** The newly created `Domain` object.

---

### `DELETE /api/domains/[id]`
Deletes a domain by its UUID.

**Response:** `{ "success": true }`

---

### `POST /api/check` (also `GET` for cron)
Re-checks all domains and sends alerts.

**Logic (per domain):**
1. Open TLS connection, read cert expiry
2. Update `expiry_date`, `days_remaining`, `last_checked` in Supabase
3. If `days_remaining` is exactly 30, 14, or 7 → send alert email

**Response:**
```json
{
  "checked": 3,
  "results": [
    { "domain": "example.com", "daysRemaining": 45, "status": "ok" },
    { "domain": "broken.com", "status": "error" }
  ]
}
```

---

## SSL Certificate Fetching (`lib/cert.ts`)

Uses Node.js built-in `tls` module. No external dependencies.

**Process:**
1. Open TLS socket to `domain:443`
2. Read `getPeerCertificate()` — extracts `valid_to` and `valid_from`
3. Calculate `daysRemaining` as `ceil((expiryDate - now) / 86400000)`
4. Timeout: 10 seconds; on error or timeout → returns `null`

---

## Email Alerts (`lib/email.ts`)

**Provider:** Resend
**From address:** `CertWatch <onboarding@resend.dev>`
**To:** `tinysunmoon@gmail.com` (configurable via `ALERT_EMAIL` env var)

### Alert Thresholds

```
ALERT_THRESHOLDS = [30, 14, 7]
```

### When alerts fire

| Trigger | Condition |
|---------|-----------|
| **On add** | `days_remaining < 7` OR `days_remaining` is exactly 30, 14, or 7 |
| **Daily cron / Check Now** | `days_remaining` is exactly 30, 14, or 7 |

The daily cron uses exact matches only to avoid sending repeated emails every day. The "on add" check uses `shouldAlert()` which also catches anything already below 7 days — so a domain with 4 days left gets an immediate alert the moment it's added.

### Email subject format

```
⚠️ Warning: SSL Certificate for example.com (14 days left)
🔴 Critical: SSL Certificate for example.com (4 days left)
🚨 EXPIRED: SSL Certificate for example.com (-2 days left)
```

---

## Deployment

### Vercel Setup
1. Import `tinysunmoon/certwatch` from GitHub on Vercel
2. Add all four environment variables in Vercel project settings
3. Deploy — Vercel auto-deploys on every push to `main`
4. Cron job activates automatically from `vercel.json`

### Vercel Plan Note
Cron jobs require at least the **Hobby** plan on Vercel (free tier supports 1 cron job).

---

## Known Limitations

| Limitation | Detail |
|-----------|--------|
| No auth | Single-user tool, no login required |
| No dedup on alerts | If a domain stays at exactly 7 days for multiple cron runs (e.g. timezone mismatch), it may send duplicate emails |
| Private/internal domains | TLS fetch only works for publicly reachable domains; use manual date entry for private certs |
| Node 18 | App runs on Node 18; Supabase JS warns about deprecation but works fine |
| Resend from address | Free tier requires using `onboarding@resend.dev` as sender |

# CertWatch — Detailed Design Document

## Overview

CertWatch is a shared SSL certificate monitoring tool. Multiple users can track their domains, view expiry status on a dashboard, and each receive their own alert emails before certificates expire — so they can request renewal from the responsible team in time.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend + Backend | Next.js 14 (App Router, TypeScript) | Web app and API routes |
| Database | Supabase (PostgreSQL) | Stores domain records |
| Email | Resend | Sends per-domain alert emails |
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
│       │       └── route.ts      # PATCH edit domain, DELETE domain
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
| `valid_from` | date | SSL cert start date, manually entered |
| `expiry_date` | date | SSL cert expiry date, manually entered |
| `days_remaining` | int | Days until expiry, recalculated on each check |
| `last_checked` | timestamp | When the cert was last checked |
| `alert_email` | text | Email address to notify for this domain |
| `renewal_requested` | boolean | Whether renewal has been requested (default: false) |
| `notes` | text | Free-text notes, e.g. owner team, ticket number |
| `check_error` | text | Last TLS check error message, null if healthy |
| `created_at` | timestamp | When the domain was added |

**Full setup SQL:**
```sql
create table domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  valid_from date,
  expiry_date date,
  days_remaining int,
  last_checked timestamp with time zone,
  alert_email text,
  renewal_requested boolean default false,
  notes text,
  check_error text,
  created_at timestamp with time zone default now()
);
```

---

## Environment Variables

Stored in `.env.local` (never committed to git). Must also be added to Vercel project settings.

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `RESEND_API_KEY` | Resend API key for sending emails |

> Note: There is no global `ALERT_EMAIL`. Every domain must have its own `alert_email` set at the time of adding.

---

## Features

### 1. Summary Stats

Four clickable cards at the top of the dashboard showing counts per status:
- 🔴 Critical, 🟡 Warning, 🟢 Safe, ⚫ Expired
- Clicking a card filters the table to show only that status
- Clicking again clears the filter

---

### 2. Dashboard Table (`app/page.tsx`)

Displays all tracked domains with the following columns:

| Column | Description |
|--------|-------------|
| Domain | Domain name + TLS check error if any |
| Valid From | Cert start date |
| Expiry Date | Cert expiry date |
| Days Left | Days until expiry |
| Status | Color-coded badge |
| Renewal | Toggle button — "Not yet" or "✓ Requested" |
| Alert Email | Per-domain notification email |
| Notes | Free-text notes (truncated, full text on hover) |
| Last Checked | When the cert was last checked |
| Actions | Edit / Remove |

**Status badge logic:**

| Days Remaining | Badge |
|---------------|-------|
| > 30 days | 🟢 Safe |
| 14–30 days | 🟡 Warning |
| < 14 days | 🔴 Critical |
| < 0 (expired) | ⚫ Expired |
| null | Grey — Unknown |

**Sortable columns:** Domain, Expiry Date, Days Left — click header to sort ascending/descending.

**TLS check error:** If the last Check Now failed for a domain, an orange warning is shown under the domain name. Existing expiry data is preserved.

---

### 3. Add Domain Form

All fields are required (marked with red `*`):

| Field | Type | Description |
|-------|------|-------------|
| Domain | Text | e.g. `example.com` |
| Valid From | Date picker | SSL cert start date |
| Expiry Date | Date picker | SSL cert expiry date |
| Alert Email | Email | Who receives alerts for this domain |
| Notes | Text | Optional free-text (e.g. owner, ticket number) |

**Behaviour:**
- Duplicate detection — returns an error if the domain is already tracked
- `days_remaining` is calculated from `expiry_date` on submit
- If the cert is already at or below an alert threshold, an email is sent immediately

---

### 4. Inline Edit

- Each row has an **Edit** button
- Clicking it turns that row into inline inputs for: Valid From, Expiry Date, Alert Email, Notes
- **Save** updates the record; `days_remaining` is recalculated from the new expiry date
- **Cancel** discards changes

---

### 5. Renewal Toggle

- Each row has a **Renewal** button
- Clicking toggles `renewal_requested` between `false` ("Not yet") and `true` ("✓ Requested")
- No confirmation needed — instant toggle
- Useful for tracking which certs you've already raised with the responsible team

---

### 6. Delete Domain

- Each row has a **Remove** link
- Clicking shows inline **Confirm / Cancel** — no modal
- Confirmed deletion removes the row from Supabase and refreshes the dashboard

---

### 7. Check Now (Manual Re-check)

- Button in the dashboard header
- Calls `POST /api/check`
- Attempts TLS connection for every tracked domain (with up to 2 retries)
- On success: updates `expiry_date`, `days_remaining`, `last_checked`, clears `check_error`
- On failure: records error in `check_error`, preserves existing expiry data
- Sends alert emails if a domain hits an exact threshold (30, 14, or 7 days)
- Dashboard refreshes automatically after completion

---

### 8. Auto Daily Check (Vercel Cron)

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
- Same logic as Check Now
- No user action required

---

### 9. Export CSV

- Button in the dashboard header
- Downloads all currently displayed domains as `certwatch-export.csv`
- Columns: Domain, Valid From, Expiry Date, Days Left, Status, Renewal Requested, Alert Email, Notes, Last Checked

---

## API Routes

### `GET /api/domains`
Returns all tracked domains ordered by `created_at` descending.

**Response:** Array of `Domain` objects.

---

### `POST /api/domains`
Adds a new domain. All fields are required.

**Request body:**
```json
{
  "domain": "example.com",
  "valid_from": "2025-01-01",
  "expiry_date": "2026-01-01",
  "alert_email": "owner@example.com",
  "notes": "Infra team — Jira INF-123"
}
```

**Logic:**
1. Validate all required fields are present
2. Check for duplicate — return 409 if domain already exists
3. Calculate `days_remaining` from `expiry_date`
4. Insert into Supabase
5. If `days_remaining` triggers `shouldAlert()` → send email immediately

**Response:** The newly created `Domain` object.

---

### `PATCH /api/domains/[id]`
Updates one or more fields on a domain.

**Request body** (all fields optional):
```json
{
  "valid_from": "2025-01-01",
  "expiry_date": "2026-06-01",
  "alert_email": "new@example.com",
  "renewal_requested": true,
  "notes": "Updated ticket: INF-456"
}
```

**Logic:** Recalculates `days_remaining` if `expiry_date` is updated.

**Response:** The updated `Domain` object.

---

### `DELETE /api/domains/[id]`
Deletes a domain by its UUID.

**Response:** `{ "success": true }`

---

### `POST /api/check` (also `GET` for cron)
Re-checks all domains and sends alerts.

**Logic (per domain):**
1. Attempt TLS connection — retry up to 2 times on failure
2. **On success:** update `expiry_date`, `days_remaining`, `last_checked`, clear `check_error`
3. **On failure:** update `last_checked` and `check_error`, keep existing expiry data
4. If `days_remaining` is exactly 30, 14, or 7 → send alert to `domain.alert_email`

**Response:**
```json
{
  "checked": 3,
  "results": [
    { "domain": "example.com", "daysRemaining": 45, "status": "ok" },
    { "domain": "internal.corp", "status": "error" }
  ]
}
```

---

## SSL Certificate Fetching (`lib/cert.ts`)

Uses Node.js built-in `tls` module. No external dependencies.

**Process:**
1. Open TLS socket to `domain:443`
2. Read `getPeerCertificate()` — extracts `valid_to`
3. Calculate `daysRemaining` as `ceil((expiryDate - now) / 86400000)`
4. Timeout: 10 seconds; on error or timeout → returns `null`

---

## Email Alerts (`lib/email.ts`)

**Provider:** Resend
**From address:** `CertWatch <onboarding@resend.dev>`
**To:** Per-domain `alert_email` — no global default

### Alert Thresholds

```
ALERT_THRESHOLDS = [30, 14, 7]
```

### When alerts fire

| Trigger | Condition |
|---------|-----------|
| **On add** | `days_remaining < 7` OR exactly 30, 14, or 7 |
| **Daily cron / Check Now** | `days_remaining` is exactly 30, 14, or 7 |

The daily cron uses exact matches only to avoid sending repeated emails every day. The on-add check also catches anything already below 7 days.

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
2. Add the three environment variables in Vercel project settings
3. Deploy — Vercel auto-deploys on every push to `main`
4. Cron job activates automatically from `vercel.json`

### Vercel Plan Note
Cron jobs require at least the **Hobby** plan on Vercel (free tier supports 1 cron job).

---

## Known Limitations

| Limitation | Detail |
|-----------|--------|
| No auth | Anyone with the URL can add or edit domains |
| No dedup on alerts | If a domain stays at exactly 7 days across multiple cron runs (e.g. timezone mismatch), it may send duplicate emails |
| Private/internal domains | TLS check only works for publicly reachable domains; manual expiry dates should be used for private certs and updated manually |
| Node 18 | App runs on Node 18; Supabase JS warns about deprecation but works fine |
| Resend from address | Free tier requires using `onboarding@resend.dev` as sender |

# CertWatch — Requirements

## Overview
A personal SSL certificate monitoring tool. Add domains, see their expiry status on a dashboard, and receive email alerts before certs expire.

## Tech Stack
- **Next.js** — web app
- **Supabase** — database (stores domains + expiry dates)
- **Vercel Cron** — runs daily cert checks automatically
- **Resend** — sends alert emails

## Users
- Single user (no login needed)
- Alert emails go to: tinysunmoon@gmail.com

## Features

### 1. Dashboard (Home Page)
- List of all tracked domains
- Each row shows:
  - Domain name (e.g. mysite.com)
  - Expiry date
  - Days remaining
  - Status badge: 🟢 Safe (>30 days) | 🟡 Warning (14–30 days) | 🔴 Critical (<14 days) | ⚫ Expired
- "Add Domain" button
- "Check Now" button (manually re-check all certs)
- Last checked timestamp

### 2. Add Domain
- Simple form: enter domain name (e.g. mysite.com)
- Tool automatically fetches the SSL cert expiry date
- Saves to database
- Redirects back to dashboard

### 3. Delete Domain
- Remove a domain from tracking (with confirmation)

### 4. Auto Daily Check (Vercel Cron)
- Runs every day at 8:00 AM
- Re-checks all domains' SSL expiry dates
- Updates the database
- Triggers alert emails for domains expiring soon

### 5. Email Alerts
- Triggered when a domain has exactly 30, 14, or 7 days remaining
- Email includes:
  - Domain name
  - Exact expiry date
  - Days remaining
  - A reminder to request renewal from the responsible team
- One email per threshold per domain (no spam)

## Database Schema (Supabase)

**Table: domains**
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| domain | text | e.g. mysite.com |
| expiry_date | date | SSL cert expiry date |
| days_remaining | int | Calculated daily |
| last_checked | timestamp | When cert was last checked |
| created_at | timestamp | When domain was added |

## Visual Style
- Clean, minimal, professional
- Color-coded status badges
- Simple table layout
- Mobile friendly

## Notification Logic
- Check daily at 8:00 AM
- Send email if days_remaining is exactly 30, 14, or 7
- One email per threshold per domain — no duplicates

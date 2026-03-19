# Setup Guide

## 1. Supabase Setup

### Create the database
1. Go to your Supabase project → **SQL Editor**
2. Copy the contents of `supabase/schema.sql` and run it
3. Your tables, RLS policies, and seed data will be created

### Create the logos storage bucket
1. Go to **Storage** in Supabase
2. Click **New bucket** → name it `logos` → check **Public bucket** → Create

### Get your credentials
1. Go to **Settings → API**
2. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Create your first user (team login)
1. Go to **Authentication → Users → Invite user**
2. Enter the email for each team member
3. They'll receive an email to set their password
4. Repeat for additional team members

---

## 2. Local Development

Update `.env.local` with your real Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

Then run:
```bash
npm install
npm run dev
```

Open http://localhost:3000

---

## 3. Deploy to Netlify

### Connect repo
1. Push this folder to a GitHub repo
2. Go to **app.netlify.com** → **Add new site** → **Import an existing project**
3. Connect your GitHub repo

### Set environment variables in Netlify
Go to **Site settings → Environment variables** and add:
- `NEXT_PUBLIC_SUPABASE_URL` → your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → your Supabase anon key

### Deploy
Netlify will auto-deploy on every push to main. The `netlify.toml` and `@netlify/plugin-nextjs` handle everything.

---

## 4. App Features

| Page | Description |
|------|-------------|
| `/` | New invoice form |
| `/invoices` | All saved invoices (filter by status, search) |
| `/invoices/:id` | Edit a saved invoice + re-download PDF |
| `/contacts` | Saved customers for quick autofill |
| `/items` | Catalog items with preset price & VAT |
| `/settings` | Company details + logo upload |

### Invoice workflow
1. Type customer name → autocomplete from saved contacts
2. Add items → autocomplete from catalog
3. Toggle 🇩🇪 / 🇬🇧 for German or English PDF
4. **Generate & download** → PDF is created and invoice is saved
5. **Save as draft** → saved without downloading
6. View all invoices at `/invoices`, click to re-edit and re-download

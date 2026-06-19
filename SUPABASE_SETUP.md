# Supabase setup

This app can run fully local without Supabase. To sync data between phone and desktop, add a Supabase project and configure these steps.

## 1. Create tables and policies

Open the Supabase SQL editor and run:

```sql
-- Paste the contents of supabase/schema.sql here.
```

The schema creates:

- `sessions`
- `runs`
- row-level security policies scoped to the signed-in Supabase user

## 2. Configure auth

In Supabase Auth settings:

- Enable email sign-in.
- Add your production Vercel URL to allowed redirect URLs.
- Add `http://localhost:3000` for local testing.

## 3. Add environment variables

Copy `.env.example` to `.env.local` for local development:

```text
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

In Vercel, add the same variables under Project Settings -> Environment Variables.

## 4. Sync model

- The app saves every action locally first.
- When signed in, it pulls cloud data, merges newer `updatedAt` records, and pushes local changes.
- Deleted runs use tombstones so offline deletes can sync later.
- Active run timers and unsaved draft run entries stay local-only until the run is saved.

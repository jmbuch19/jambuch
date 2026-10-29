# jambuch.in

Personal site of Jaydeep Buch: projects, reading, translations, workshop,
advising, music, ideas, library and notebook.

- Next.js (App Router) on Vercel
- Supabase (database, email sign-in, row-level security)
- Mockups in `/design` (reference only, not runnable)

## Run locally

```
npm install
cp .env.example .env.local   # then fill in values
npm run dev
```

Secret keys go in `.env.local` and Vercel only. Never commit them.

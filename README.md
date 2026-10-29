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

## Admin (`/admin`)

Sign in with a link emailed to `ADMIN_EMAIL`. One-time setup:

1. Supabase → Authentication → URL Configuration: set Site URL to
   `https://jambuch.in` and add these Redirect URLs:
   `https://jambuch.in/auth/callback` and `http://localhost:3000/auth/callback`.
2. Go to `/admin/login` and sign in once. This creates your row in `members`
   with the plain `member` role.
3. Grant the admin role in the Supabase SQL editor (never from the app):

   ```sql
   update public.members set role = 'admin' where email = 'jambuch@gmail.com';
   ```

4. Reload `/admin`.

Both checks must pass: the email must match `ADMIN_EMAIL`, and the database
role must be `admin` (row-level security uses the role for every write).

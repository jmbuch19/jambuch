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

### Hide, Trash and delete

- **Hide** turns `published` off: the item stays in the admin, gone from the site.
- **Delete** moves the item to the **Trash** (`deleted_at` is set; row-level
  security hides it from visitors). Its public R2 files move to the private
  trash bucket, so their old links stop working. Rows that belong to it (a
  translation's chapters) go with it and come back with it on Restore.
- **Delete permanently** (from the Trash, or by the daily job after 30 days)
  removes the row and its R2 files, then writes a line to `delete_log`.
- A file still used by another item is never moved or deleted; the confirm
  dialog lists where it's used.
- If R2 isn't configured, items that have R2 files can't be deleted at all,
  so no file is ever orphaned.

Rules for features still to come:

- **Library CSV import** only adds or updates books (matched on ISBN). It never
  deletes a book missing from the new CSV unless "replace whole library" is
  ticked and confirmed, and even then the books go to the Trash.
- **Guest creators** may delete only their own items, and their deletes also go
  to the Trash (`deleted_by` records who).

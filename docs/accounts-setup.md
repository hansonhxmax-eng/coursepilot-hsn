# Configure real CoursePilot accounts

GitHub Pages serves the account-enabled website. Supabase provides email/password
authentication and private saved workspaces. This repository supplies the
integration and SQL. The site owner configured the project, private table,
email redirects and mail service before release. Live browser checks confirmed
the account pages load; actual mailbox delivery and cross-user database access
still need to be exercised with real test accounts.

## 1. Create the project

Open [the Supabase dashboard](https://supabase.com/dashboard), choose **New
project**, and create a project such as `coursepilot`. Choose a region close to
the intended users, such as Singapore. Keep the database password private.

The supplied project's **Project URL** and **Publishable key** are recorded in
`.env.production` for reproducible builds. The publishable key is intended to
be included in a browser application; row-level security and each user's
access token control private data access.

Share only the Project URL and publishable key with the person configuring the
site. Do not send a database password, SMTP password, secret key, access token,
or `service_role` key in chat or place one in a `VITE_` environment variable.
All `VITE_` variables become part of the public JavaScript build.

## 2. Create the private workspace table

In the project's **SQL Editor**, run the complete contents of
[`202611040001_user_workspaces.sql`](../supabase/migrations/202611040001_user_workspaces.sql).
Run it as the project's database administrator, not through the browser app.

The migration creates `public.user_workspaces`, keyed by `auth.users.id`, and
enables and forces row-level security. Authenticated users can read, insert,
update and delete only their own row. Anonymous visitors have no table
privileges. The database supplies the update timestamp, and workspace data must
be a JSON object no larger than 100 KiB of serialized text. Deleting an account
from Supabase Auth also deletes its workspace.

No public profile table or public workspace policy is needed. Do not disable
row-level security to resolve a client error. Check project configuration,
authentication, table grants and the requested `user_id` instead.

## 3. Configure email authentication and redirects

In **Authentication**, enable the **Email** provider and email/password signup.
Keep email confirmation enabled. Set the minimum password length to at least
12 characters, matching the website form.

In **Authentication → URL Configuration**, set **Site URL** to:

```text
https://hansonhxmax-eng.github.io/first-project/
```

Add these exact production **Redirect URLs**:

```text
https://hansonhxmax-eng.github.io/first-project/?auth=confirm
https://hansonhxmax-eng.github.io/first-project/?auth=recovery
```

When testing locally, also add the callback URLs for the port in use, for example:

```text
http://localhost:5173/?auth=confirm
http://localhost:5173/?auth=recovery
```

Keep production redirect entries specific to this site. If using custom email
templates, retain Supabase's `{{ .ConfirmationURL }}` link so signup confirmation
and recovery links keep their token and requested redirect. With the PKCE flow,
open the email link in the same browser used to request it. A different browser
may not have the verification state needed to complete the callback.

## 4. Configure delivery before opening public signup

Supabase's built-in email sender is for limited testing and restricts recipients
to authorized project-team addresses. It is not sufficient for arbitrary
students to register, confirm an email address, or reset a password.

In **Authentication → SMTP Settings**, configure a supported mail provider using
its SMTP host, port, username, password and sender address. Verify the sender
domain with that provider and keep the SMTP credentials in Supabase's dashboard,
never in the website or repository. Check the provider's sending limits and
Supabase's authentication email rate limits for the intended usage. See
[Supabase custom SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp).

Send confirmation and recovery messages to a real test address outside the
project team before opening registration to other users. Leaving confirmation
enabled without working delivery will prevent new users from signing in.

## 5. Configure and build the website

The supplied public project URL and publishable key are already in
`.env.production`. If you change projects, copy [`.env.example`](../.env.example)
to an ignored `.env.local` file in the repository root and replace both
placeholders:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

These values are read at build time. Restart Vite after changing them. A deployed
site requires a new build; editing environment variables alone does not change
the existing `gh-pages` files.

Run the application checks and `npm run build`, then publish `dist/` using the
[existing GitHub Pages procedure](../submission/deployment.md). Before any future
project change, verify the backend and email delivery against a configured build.

To run browser tests without a live Supabase project, build a separate local
fixture bundle and serve it at `http://127.0.0.1:4174/`:

```sh
VITE_SUPABASE_URL=https://coursepilot-test.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_coursepilot_fixture \
npm run build -- --outDir /tmp/coursepilot-auth-test-dist --emptyOutDir
python3 -m http.server 4174 --bind 127.0.0.1 --directory /tmp/coursepilot-auth-test-dist
```

In another terminal, run `BASE_URL=http://127.0.0.1:4174/ python3 tests/accounts_browser.py`.
This test intercepts all requests to the fixture domain and must never target
the live website. With `AUTH_FIXTURE=1`, the existing review, real-schedule
and synthetic browser suites also sign in to a local mock account.

## 6. Verify account isolation on the real project

Local tests that mock authentication or database requests verify frontend
behavior. They do not verify Supabase project settings, mail delivery or database
row-level security. Complete these checks against the configured project:

1. Register test user A, confirm their email, and sign in. Save a course selection
   and preferences, reload, and confirm the saved data remains.
2. Sign out, then sign in as test user B in the same browser. User B must receive
   a separate workspace without A's selected courses, settings or watchlist.
3. Open another browser session as A. Confirm A's saved workspace is available
   there and B's changes have not replaced it.
4. Using the publishable key with B's own authenticated session, query
   `user_workspaces` for A's `user_id`: no row should be returned. Attempts to
   insert or upsert A's row must fail. Updates/deletes filtered to A must affect
   no rows. Verify A's data is unchanged afterward. An anonymous request must
   have no access. Do not use the SQL Editor's administrator role or a secret
   key for these tests, since those credentials bypass user-level restrictions.
5. Exercise wrong-password, expired-link, email-confirmation and password-reset
   flows. After a successful reset, the new password should work and the old
   password should fail. Check logout and a refresh after logout as well.
6. Confirm a temporary database failure presents a retry path and does not
   silently replace an existing saved workspace with empty defaults.

Existing anonymous browser selections are not automatically assigned to a new
account. Reviews and course information remain shared public content; each
user's planning workspace is private. Keep database backups and authentication
settings in the Supabase project under the site owner's control.

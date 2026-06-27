# Clad

AI outfit recommender. Photograph your wardrobe, get outfit picks for an occasion + the live weather, powered by Gemini 2.0 Flash.

## Stack

- **App:** React Native (Expo SDK 54, managed workflow), TypeScript
- **Backend:** Supabase — Postgres, Storage, Auth, Edge Functions (Deno)
- **AI:** Gemini 2.0 Flash via Google Generative AI API (called only from Edge Functions)
- **Weather:** Open-Meteo (no API key)
- **Email:** Resend SMTP (for OTP codes)

## Architecture

```text
RN app ──► Supabase Edge Function ──► Gemini API ──► response ──► RN app
```

The **Gemini API key lives only as a Supabase Edge Function secret** — never in client code, .env, or the app bundle. The app holds only the Supabase **anon** key (public by design; Row-Level Security enforces per-user data isolation).

## Features

- **Auth** — passwordless 6-digit OTP code via email (see [Auth notes](#auth-notes))
- **Wardrobe upload** — camera or photo library; client-side compress to 1024px (`expo-image-manipulator`); rejects >5MB; uploads to private `wardrobe-photos` Storage bucket
- **AI tagging** — `analyze-clothing` Edge Function sends the photo to Gemini for category / color / style tags; user can edit before saving
- **Outfit recommendation** — pick an occasion, fetch live weather (GPS or manual city), `recommend-outfit` Edge Function sends the wardrobe as JSON (not images, to control token cost) to Gemini and returns item IDs + rationale
- **Empty states** — empty wardrobe, missing required category, rate-limit, errors

## Project layout

```text
Clad/
├── mobile/                       # Expo React Native app
│   ├── App.tsx                   # navigation + auth session
│   └── src/
│       ├── lib/supabase.ts       # Supabase client (URL + anon key)
│       ├── screens/              # Auth, Wardrobe, Upload, Recommend
│       └── types/index.ts
├── supabase/
│   ├── config.toml               # auth, SMTP, email template config
│   ├── migrations/               # SQL schema + RLS + storage policies
│   ├── templates/magic_link.html # OTP email body ({{ .Token }})
│   └── functions/
│       ├── analyze-clothing/     # Gemini vision → tags
│       ├── recommend-outfit/     # Gemini → outfit (with rate limit)
│       └── auth-redirect/        # unused magic-link bridge (deletable)
├── DECISIONS.md                  # assumptions + production gaps
└── README.md
```

## Supabase project

- **Ref:** `trdacrdlzbxnozrnpnpz`
- **Name:** Clad
- **Region:** ap-southeast-2
- **URL:** `https://trdacrdlzbxnozrnpnpz.supabase.co`

### Database

`clothing_items` — `id`, `user_id` (FK `auth.users`), `image_url`, `category`, `color`, `style_tags[]`, `created_at`. RLS: users read/write only their own rows.

`recommendation_calls` — rate-limit counter (max 20 `recommend-outfit` calls/user/hour).

Storage bucket `wardrobe-photos` — private, 5MB limit; RLS restricts each user to their own `user_id/` folder.

### Edge Functions

| Function | Public? | Purpose |
|----------|---------|---------|
| `analyze-clothing` | JWT | image URL → Gemini vision → `{category, color, style_tags}`; graceful error → "tag manually" |
| `recommend-outfit` | JWT | wardrobe JSON + weather + occasion → Gemini → `{item_ids, rationale}`; per-user rate limit |
| `auth-redirect` | public | leftover magic-link bridge, no longer used |

Both AI functions wrap Gemini in try/catch; malformed/non-JSON responses return a clean client error, never a stack trace.

### Secrets (server-side only)

- `GEMINI_API_KEY` — Gemini key, set via `supabase secrets set`
- `SMTP_PASSWORD` — Resend API key, passed as an env var at `supabase config push` (never committed)

## Run on your phone (Expo Go)

Requires the **Expo Go** app (SDK 54) and your phone + Mac on the **same Wi-Fi**.

```bash
cd mobile
npx expo start --lan
```

Scan the QR with Expo Go (iOS: Camera app; Android: Expo Go scanner).

**Sign in:** type your email → **Send code** → check email for a 6-digit code → enter it → in.

## Auth notes

Auth uses **OTP codes**, not magic links. Magic links are unreliable in iOS Expo Go (Safari won't launch a custom scheme from a redirect). OTP keeps the flow inside the app.

The OTP email requires a custom email template (`{{ .Token }}`), which Supabase free tier blocks with the default mailer — so **Resend SMTP** is configured in [supabase/config.toml](supabase/config.toml). The sender is Resend's sandbox `onboarding@resend.dev`, which only delivers to the Resend account's own signup email. For real users: verify a domain in Resend and update `admin_email`.

## Redeploy / re-configure

```bash
# DB schema
supabase db push --linked

# Edge Functions
supabase functions deploy analyze-clothing  --project-ref trdacrdlzbxnozrnpnpz
supabase functions deploy recommend-outfit  --project-ref trdacrdlzbxnozrnpnpz

# Auth + SMTP + email template (API key from env, not committed)
SMTP_PASSWORD=<resend_re_key> supabase config push --yes

# Secrets
supabase secrets set GEMINI_API_KEY=<key> --project-ref trdacrdlzbxnozrnpnpz
```

## Known gaps

No automated tests, no content moderation on photos, no cost caps beyond the 20/hr rate limit, image URLs expire after 1 year, Resend sandbox limited to one recipient. Full list + Gemini prompt-drift risk in [DECISIONS.md](DECISIONS.md).

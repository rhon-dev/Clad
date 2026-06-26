# Clad — Decisions & Assumptions

## Architecture decisions

### Supabase anon key in client
The Supabase **anon** key is embedded in the RN source file. This is intentional and safe:
- The anon key is designed to be public; it does not grant elevated permissions.
- Row-Level Security (RLS) on `clothing_items` and Storage policies enforce that each user can only access their own data.
- The **Gemini API key** lives exclusively as a Supabase Edge Function secret; it never appears in client code.

### Image URL storage strategy
After upload, a **1-year signed URL** is generated and stored in `clothing_items.image_url`. Trade-off: URLs expire after a year and would need refresh. Alternative (storing storage path + fetching signed URL at render time) was rejected to avoid N+1 signed-URL requests on wardrobe load. For production, add a background job to refresh expiring URLs or switch to storing the path and generating URLs in bulk.

### Temporary upload for analysis
The `analyze-clothing` flow uploads to `user_id/temp_<timestamp>.jpg` to get a URL for Gemini, then uploads the final file to `user_id/<timestamp>.jpg` on save. This means orphaned temp files accumulate if the user abandons mid-flow. For production, add a Storage lifecycle rule or cleanup job to delete files matching `*/temp_*` older than 1 hour.

### Weather is optional
If the user denies location and doesn't enter a city, `weather: null` is sent to `recommend-outfit`. The prompt tells Gemini "Weather unknown" — Gemini gracefully ignores the weather constraint. This is documented in the UI ("Weather is optional").

### Rate limiting approach
`recommendation_calls` table stores a row per call and counts calls in the last hour. This is a simple, serverless-safe approach. Trade-off: it doesn't prevent burst abuse within a single second. For production, use a dedicated rate-limiting service (Redis + Upstash, or Supabase's pg_cron to purge old rows).

### Signed URLs for Gemini image analysis
The `analyze-clothing` function fetches the image from a short-lived (5-minute) signed URL and converts it to base64 to pass as an inline image to Gemini. Alternative (passing the URL directly as a Gemini `fileData` part) would require the image to be publicly accessible. Inline base64 keeps the bucket private.

## Production gaps (not built, by design)

### No automated tests
Skipped per spec. Gap for production: unit tests for Edge Function JSON parsing logic and RN component smoke tests are the highest-value additions.

### No content moderation
Users can upload any image. For production, add NSFW detection (e.g., Google Cloud Vision SafeSearch) before the Gemini analysis step.

### No cost caps beyond basic rate limit
The 20 calls/hour rate limit is a soft guard. For production, add Gemini API budget alerts in Google Cloud Console and hard-stop via checking a flag in the DB.

### Gemini prompt drift risk
If Google updates `gemini-2.0-flash`, the response format may change silently. The JSON-parsing defensive code handles this gracefully (falls back to user tagging), but the model version is not pinned. For production, pin the model version and add a monitoring alert if the JSON parse failure rate exceeds a threshold.

### No token refresh for image URLs
Stored image URLs expire after 1 year. Implement URL refresh before expiry for long-lived apps.

### No offline support
As per spec. Wardrobe loads require network; there's no local cache.

### No push notifications
As per spec.

### No monitoring / observability
Edge Function logs are available in the Supabase Dashboard. For production, forward logs to a centralized platform (Datadog, Sentry).

## Library choices

| Choice | Reason |
|--------|--------|
| `@react-navigation/native-stack` | Native performance; standard for Expo managed workflow |
| `@react-navigation/bottom-tabs` | Standard two-tab layout (Wardrobe / Outfit) |
| `expo-image-picker` | Managed Expo plugin, handles permissions cleanly |
| `expo-image-manipulator` | Compress + resize before upload, avoiding large payloads |
| `expo-location` | Expo-managed location with permission flow |
| Open-Meteo | Free, no API key, reliable global weather data |
| Gemini 2.0 Flash | Fast, multimodal, cost-efficient for image classification |

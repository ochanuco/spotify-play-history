# Ingestion App

## Inputs
- Spotify `user-read-recently-played` scope
- `GET /v1/me/player/recently-played?limit=50&after=<epoch_ms>`

## Cursor Handling
- Read `last_played_at` from `spotify_raw.state`
- Compute `after = last_played_at_ms - 120000` (2 min rollback)
- Insert all results into `spotify_raw.plays_raw`
- Update `last_played_at` to max `played_at` from response

## Behavior
- Append-only; duplicates allowed
- If no state exists, choose a safe default (e.g. now-2days)

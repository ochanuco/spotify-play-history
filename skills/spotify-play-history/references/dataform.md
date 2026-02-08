# Dataform Models

## `spotify.plays`
- Incremental table
- Unique key: `(user_id, played_at, track_id)`
- Use minimum `ingested_at` for duplicates
- Process window: last 2 days only

## Notes
- Source: `spotify_raw.plays_raw`
- Use `DATE(played_at)` to filter window

# Architecture

## Flow
- Spotify API `recently-played` -> Scheduler (10 min) -> Cloud Run/Functions -> BigQuery `spotify_raw.plays_raw` (append-only)
- Dataform transforms `spotify_raw` -> `spotify.plays` for Looker Studio

## Non-Functional
- Duplicates acceptable at ingestion; dedup in Dataform
- Secrets in Secret Manager only
- Minimize BigQuery costs by limiting transform window (e.g. last 2 days)

## Regions
- BigQuery dataset location: `asia-northeast1`

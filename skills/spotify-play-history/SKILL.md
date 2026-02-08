---
name: spotify-play-history
description: Build and operate the spotify-play-history project (Spotify API ingestion to BigQuery, Dataform modeling, Looker Studio). Use for tasks involving GCP setup (Terraform, IAM, Scheduler/Run), ingestion app logic, BigQuery schemas/state management, or Dataform SQLX models for dedup and analytics.
---

# Spotify Play History

## Overview

Implement the end-to-end pipeline defined in PLAN.md: ingest Spotify “recently played” into BigQuery (append-only), deduplicate/normalize with Dataform, and visualize in Looker Studio. Keep infra managed by Terraform and secrets in Secret Manager.

## Workflow

1. Read PLAN.md and confirm any open decisions (language/runtime, schedule interval, GCP project/location).
2. Implement infrastructure in `infra/` using Terraform.
3. Implement ingestion app in `app/` with append-only inserts to `spotify_raw.plays_raw`.
4. Implement Dataform models in `dataform/` with incremental dedup for `spotify.plays`.
5. Verify acceptance criteria and update docs.

## References

Use the references below as needed instead of re-deriving details:
- `references/architecture.md` for end-to-end flow and non-functional constraints
- `references/bigquery.md` for datasets, tables, and state schema
- `references/dataform.md` for incremental dedup model details
- `references/terraform.md` for resource list and IAM guidance
- `references/app.md` for ingestion logic and cursor handling

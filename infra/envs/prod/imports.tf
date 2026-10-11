# 既存リソースを state に取り込む。取り込み後は plan が no-op になる。

import {
  to = google_project_service.services["bigquery.googleapis.com"]
  id = "${var.project_id}/bigquery.googleapis.com"
}

import {
  to = google_project_service.services["cloudfunctions.googleapis.com"]
  id = "${var.project_id}/cloudfunctions.googleapis.com"
}

import {
  to = google_project_service.services["cloudbuild.googleapis.com"]
  id = "${var.project_id}/cloudbuild.googleapis.com"
}

import {
  to = google_project_service.services["run.googleapis.com"]
  id = "${var.project_id}/run.googleapis.com"
}

import {
  to = google_project_service.services["cloudscheduler.googleapis.com"]
  id = "${var.project_id}/cloudscheduler.googleapis.com"
}

import {
  to = google_project_service.services["secretmanager.googleapis.com"]
  id = "${var.project_id}/secretmanager.googleapis.com"
}

import {
  to = google_project_service.services["artifactregistry.googleapis.com"]
  id = "${var.project_id}/artifactregistry.googleapis.com"
}

import {
  to = google_project_service.services["iam.googleapis.com"]
  id = "${var.project_id}/iam.googleapis.com"
}

import {
  to = google_project_service.services["storage.googleapis.com"]
  id = "${var.project_id}/storage.googleapis.com"
}

import {
  to = google_project_service.services["dataform.googleapis.com"]
  id = "${var.project_id}/dataform.googleapis.com"
}

import {
  to = google_bigquery_dataset.raw
  id = "projects/${var.project_id}/datasets/${local.raw_dataset}"
}

import {
  to = google_bigquery_dataset.model
  id = "projects/${var.project_id}/datasets/${local.model_dataset}"
}

import {
  to = google_bigquery_table.plays_raw
  id = "projects/${var.project_id}/datasets/${local.raw_dataset}/tables/${local.plays_raw_table}"
}

import {
  to = google_bigquery_table.state
  id = "projects/${var.project_id}/datasets/${local.raw_dataset}/tables/${local.state_table}"
}

import {
  to = google_secret_manager_secret.spotify_client_id
  id = "projects/${var.project_id}/secrets/spotify-client-id"
}

import {
  to = google_secret_manager_secret_iam_member.fn_secret_accessor_client_id
  id = "projects/${var.project_id}/secrets/spotify-client-id roles/secretmanager.secretAccessor serviceAccount:${local.function_sa_email}"
}

import {
  to = google_secret_manager_secret.spotify_client_secret
  id = "projects/${var.project_id}/secrets/spotify-client-secret"
}

import {
  to = google_secret_manager_secret_iam_member.fn_secret_accessor_client_secret
  id = "projects/${var.project_id}/secrets/spotify-client-secret roles/secretmanager.secretAccessor serviceAccount:${local.function_sa_email}"
}

import {
  to = google_secret_manager_secret.spotify_refresh_token
  id = "projects/${var.project_id}/secrets/spotify-refresh-token"
}

import {
  to = google_secret_manager_secret_iam_member.fn_secret_accessor_refresh_token
  id = "projects/${var.project_id}/secrets/spotify-refresh-token roles/secretmanager.secretAccessor serviceAccount:${local.function_sa_email}"
}

import {
  to = google_bigquery_dataset_iam_member.fn_raw_dataset_editor
  id = "projects/${var.project_id}/datasets/${local.raw_dataset} roles/bigquery.dataEditor serviceAccount:${local.function_sa_email}"
}

import {
  to = google_storage_bucket.source
  id = "${var.project_id}/${var.project_id}-spotify-play-history-src"
}

import {
  to = google_cloudfunctions2_function.ingest
  id = "projects/${var.project_id}/locations/${var.region}/functions/${var.function_name}"
}

import {
  to = google_cloud_run_service_iam_member.invoker
  id = "projects/${var.project_id}/locations/${var.region}/services/${var.function_name} roles/run.invoker serviceAccount:${local.scheduler_sa_email}"
}

import {
  to = google_cloud_scheduler_job.ingest
  id = "projects/${var.project_id}/locations/${var.region}/jobs/${var.scheduler_name}"
}

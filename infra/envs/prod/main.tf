provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

locals {
  raw_dataset     = "spotify_raw"
  model_dataset   = "spotify"
  plays_raw_table = "plays_raw"
  state_table     = "state"

  # service account は ochanuco/chabatake が管理する
  function_sa_email  = "spotify-play-history-fn@${var.project_id}.iam.gserviceaccount.com"
  scheduler_sa_email = "spotify-play-history-scheduler@${var.project_id}.iam.gserviceaccount.com"
}

resource "google_bigquery_dataset" "raw" {
  dataset_id = local.raw_dataset
  location   = var.bq_location
  project    = var.project_id
}

resource "google_bigquery_dataset" "model" {
  dataset_id = local.model_dataset
  location   = var.bq_location
  project    = var.project_id
}

resource "google_bigquery_table" "plays_raw" {
  dataset_id          = google_bigquery_dataset.raw.dataset_id
  table_id            = local.plays_raw_table
  project             = var.project_id
  schema              = file("${path.module}/schemas/plays_raw.json")
  deletion_protection = true

  time_partitioning {
    type  = "DAY"
    field = "ingested_at"
  }

  clustering = ["played_at", "track_id"]
}

resource "google_bigquery_table" "state" {
  dataset_id          = google_bigquery_dataset.raw.dataset_id
  table_id            = local.state_table
  project             = var.project_id
  schema              = file("${path.module}/schemas/state.json")
  deletion_protection = true
}

resource "google_secret_manager_secret" "spotify_client_id" {
  secret_id = "spotify-client-id"
  project   = var.project_id
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "spotify_client_secret" {
  secret_id = "spotify-client-secret"
  project   = var.project_id
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "spotify_refresh_token" {
  secret_id = "spotify-refresh-token"
  project   = var.project_id
  replication {
    auto {}
  }
}

resource "google_bigquery_dataset_iam_member" "fn_raw_dataset_editor" {
  dataset_id = google_bigquery_dataset.raw.dataset_id
  project    = var.project_id
  role       = "roles/bigquery.dataEditor"
  member     = "serviceAccount:${local.function_sa_email}"
}

resource "google_secret_manager_secret_iam_member" "fn_secret_accessor_client_id" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.spotify_client_id.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.function_sa_email}"
}

resource "google_secret_manager_secret_iam_member" "fn_secret_accessor_client_secret" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.spotify_client_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.function_sa_email}"
}

resource "google_secret_manager_secret_iam_member" "fn_secret_accessor_refresh_token" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.spotify_refresh_token.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.function_sa_email}"
}

resource "google_storage_bucket" "source" {
  name                        = "${var.project_id}-spotify-play-history-src"
  location                    = var.region
  force_destroy               = true
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
}

data "archive_file" "app_zip" {
  type        = "zip"
  source_dir  = var.app_source_dir
  output_path = "${path.module}/.tmp/app.zip"
  excludes = [
    "node_modules",
    ".git",
    ".DS_Store"
  ]
}

resource "google_storage_bucket_object" "app_zip" {
  name   = "app-${data.archive_file.app_zip.output_md5}.zip"
  bucket = google_storage_bucket.source.name
  source = data.archive_file.app_zip.output_path
}

resource "google_cloudfunctions2_function" "ingest" {
  name     = var.function_name
  location = var.region
  project  = var.project_id

  build_config {
    runtime     = "nodejs20"
    entry_point = "ingest"
    # 既定の compute SA は権限を外してあるので、ochanuco/chabatake が用意したビルド専用 SA を使う
    service_account = "projects/${var.project_id}/serviceAccounts/spotify-play-history-build@${var.project_id}.iam.gserviceaccount.com"
    source {
      storage_source {
        bucket = google_storage_bucket.source.name
        object = google_storage_bucket_object.app_zip.name
      }
    }
  }

  service_config {
    max_instance_count    = 1
    min_instance_count    = 0
    available_memory      = "256M"
    timeout_seconds       = 60
    ingress_settings      = "ALLOW_INTERNAL_ONLY"
    service_account_email = local.function_sa_email

    environment_variables = {
      PROJECT_ID             = var.project_id
      BQ_RAW_DATASET         = local.raw_dataset
      BQ_PLAYS_TABLE         = local.plays_raw_table
      BQ_STATE_TABLE         = local.state_table
      ROLLBACK_MS            = "120000"
      DEFAULT_LOOKBACK_HOURS = "48"
    }

    secret_environment_variables {
      key        = "SPOTIFY_CLIENT_ID"
      project_id = var.project_id
      secret     = google_secret_manager_secret.spotify_client_id.secret_id
      version    = "latest"
    }

    secret_environment_variables {
      key        = "SPOTIFY_CLIENT_SECRET"
      project_id = var.project_id
      secret     = google_secret_manager_secret.spotify_client_secret.secret_id
      version    = "latest"
    }

    secret_environment_variables {
      key        = "SPOTIFY_REFRESH_TOKEN"
      project_id = var.project_id
      secret     = google_secret_manager_secret.spotify_refresh_token.secret_id
      version    = "latest"
    }
  }

  depends_on = [
    google_bigquery_dataset_iam_member.fn_raw_dataset_editor,
    google_secret_manager_secret_iam_member.fn_secret_accessor_client_id,
    google_secret_manager_secret_iam_member.fn_secret_accessor_client_secret,
    google_secret_manager_secret_iam_member.fn_secret_accessor_refresh_token
  ]
}

resource "google_cloud_run_service_iam_member" "invoker" {
  location = var.region
  project  = var.project_id
  service  = google_cloudfunctions2_function.ingest.service_config[0].service
  role     = "roles/run.invoker"
  member   = "serviceAccount:${local.scheduler_sa_email}"
}

resource "google_cloud_scheduler_job" "ingest" {
  name        = var.scheduler_name
  description = "Trigger spotify-play-history ingestion"
  schedule    = var.schedule
  time_zone   = "Asia/Tokyo"
  region      = var.region
  project     = var.project_id

  http_target {
    http_method = "POST"
    uri         = google_cloudfunctions2_function.ingest.service_config[0].uri

    oidc_token {
      service_account_email = local.scheduler_sa_email
      audience              = google_cloudfunctions2_function.ingest.service_config[0].uri
    }
  }

  depends_on = [
    google_cloud_run_service_iam_member.invoker
  ]
}

resource "google_dataform_repository" "repo" {
  provider     = google-beta
  count        = var.enable_dataform ? 1 : 0
  name         = var.dataform_repo_name
  display_name = var.dataform_repo_name
  project      = var.project_id
  region       = var.region
}

resource "google_dataform_repository_release_config" "release" {
  provider      = google-beta
  count         = var.enable_dataform ? 1 : 0
  name          = var.dataform_release_config_name
  project       = var.project_id
  region        = var.region
  repository    = google_dataform_repository.repo[0].name
  git_commitish = var.dataform_git_commitish

  time_zone = "Asia/Tokyo"
}

resource "google_dataform_repository_workflow_config" "schedule" {
  provider   = google-beta
  count      = var.enable_dataform ? 1 : 0
  name       = var.dataform_schedule_name
  project    = var.project_id
  region     = var.region
  repository = google_dataform_repository.repo[0].name

  release_config = google_dataform_repository_release_config.release[0].id
  cron_schedule  = "0 * * * *"
}

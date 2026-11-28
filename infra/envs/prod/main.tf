provider "google" {
  project = var.project_id
  region  = var.region
}

data "google_project" "this" {}

locals {
  # SA は ochanuco/chabatake が管理する
  ingest_sa_member   = "serviceAccount:spotify-play-history-ingest@${var.project_id}.iam.gserviceaccount.com"
  dataform_sa_email  = "spotify-play-history-dataform@${var.project_id}.iam.gserviceaccount.com"
  dataform_sa_member = "serviceAccount:${local.dataform_sa_email}"
  dataform_agent     = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-dataform.iam.gserviceaccount.com"

  datasets = {
    raw  = "Worker が書く取得結果。append-only"
    ops  = "取得の実行記録と Dataform の assertion"
    stg  = "raw を重複除去・展開したもの"
    mart = "Looker Studio が読む集計"
  }
}

resource "google_bigquery_dataset" "spotify" {
  for_each = local.datasets

  dataset_id  = "spotify_${each.key}"
  description = each.value
  location    = var.region
}

resource "google_bigquery_table" "raw_plays" {
  dataset_id          = google_bigquery_dataset.spotify["raw"].dataset_id
  table_id            = "plays"
  schema              = file("${path.module}/schemas/raw_plays.json")
  deletion_protection = true

  time_partitioning {
    type  = "DAY"
    field = "fetched_at"
  }

  clustering = ["played_at"]
}

resource "google_bigquery_table" "ops_runs" {
  dataset_id          = google_bigquery_dataset.spotify["ops"].dataset_id
  table_id            = "runs"
  schema              = file("${path.module}/schemas/ops_runs.json")
  deletion_protection = true

  time_partitioning {
    type  = "DAY"
    field = "started_at"
  }
}

# Worker は insertAll だけを行う。鍵が漏れても届くのは raw と ops の表への書き込みまで
resource "google_bigquery_table_iam_member" "ingest_raw_plays" {
  dataset_id = google_bigquery_table.raw_plays.dataset_id
  table_id   = google_bigquery_table.raw_plays.table_id
  role       = "roles/bigquery.dataEditor"
  member     = local.ingest_sa_member
}

resource "google_bigquery_table_iam_member" "ingest_ops_runs" {
  dataset_id = google_bigquery_table.ops_runs.dataset_id
  table_id   = google_bigquery_table.ops_runs.table_id
  role       = "roles/bigquery.dataEditor"
  member     = local.ingest_sa_member
}

resource "google_bigquery_dataset_iam_member" "dataform" {
  for_each = {
    raw  = "roles/bigquery.dataViewer"
    ops  = "roles/bigquery.dataEditor"
    stg  = "roles/bigquery.dataEditor"
    mart = "roles/bigquery.dataEditor"
  }

  dataset_id = google_bigquery_dataset.spotify[each.key].dataset_id
  role       = each.value
  member     = local.dataform_sa_member
}

# Dataform が GitHub から読むための token。値は手で入れる（README）
resource "google_secret_manager_secret" "dataform_git_token" {
  secret_id = "spotify-play-history-dataform-git-token"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_iam_member" "dataform_git_token" {
  secret_id = google_secret_manager_secret.dataform_git_token.id
  role      = "roles/secretmanager.secretAccessor"
  member    = local.dataform_agent
}

resource "google_dataform_repository" "spotify" {
  name            = "spotify-play-history"
  region          = var.region
  service_account = local.dataform_sa_email

  git_remote_settings {
    url                                 = var.github_repository_url
    default_branch                      = "main"
    authentication_token_secret_version = "${google_secret_manager_secret.dataform_git_token.id}/versions/latest"
  }

  depends_on = [google_secret_manager_secret_iam_member.dataform_git_token]
}

resource "google_dataform_repository_release_config" "main" {
  name          = "main"
  region        = var.region
  repository    = google_dataform_repository.spotify.name
  git_commitish = "main"
  cron_schedule = "50 * * * *"
  time_zone     = "Asia/Tokyo"
}

resource "google_dataform_repository_workflow_config" "hourly" {
  name           = "hourly"
  region         = var.region
  repository     = google_dataform_repository.spotify.name
  release_config = google_dataform_repository_release_config.main.id
  cron_schedule  = "0 * * * *"
  time_zone      = "Asia/Tokyo"

  invocation_config {
    service_account = local.dataform_sa_email
  }
}

variable "project_id" {
  type        = string
  description = "GCP project id"
}

variable "region" {
  type        = string
  description = "Region for Cloud Functions and Scheduler"
  default     = "asia-northeast1"
}

variable "bq_location" {
  type        = string
  description = "BigQuery dataset location"
  default     = "asia-northeast1"
}

variable "function_name" {
  type        = string
  default     = "spotify-play-history"
}

variable "scheduler_name" {
  type        = string
  default     = "spotify-play-history"
}

variable "schedule" {
  type        = string
  default     = "*/10 * * * *"
}

variable "app_source_dir" {
  type        = string
  description = "Path to app source directory"
  default     = "../../../app"
}

variable "enable_dataform" {
  type        = bool
  default     = false
}

variable "dataform_repo_name" {
  type        = string
  default     = "spotify-play-history"
}

variable "dataform_release_config_name" {
  type        = string
  default     = "spotify-play-history"
}

variable "dataform_git_commitish" {
  type        = string
  description = "Git branch/tag/commit for Dataform release config"
  default     = "main"
}

variable "dataform_schedule_name" {
  type        = string
  default     = "spotify-play-history"
}

variable "project_id" {
  type        = string
  description = "GCP project id"
}

variable "region" {
  type    = string
  default = "asia-northeast1"
}

variable "github_repository_url" {
  type    = string
  default = "https://github.com/ochanuco/spotify-play-history.git"
}

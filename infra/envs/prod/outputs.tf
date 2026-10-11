output "function_url" {
  value = google_cloudfunctions2_function.ingest.service_config[0].uri
}

output "scheduler_service_account" {
  value = local.scheduler_sa_email
}

output "function_service_account" {
  value = local.function_sa_email
}

output "function_url" {
  value = google_cloudfunctions2_function.ingest.service_config[0].uri
}

output "scheduler_service_account" {
  value = google_service_account.scheduler.email
}

output "function_service_account" {
  value = google_service_account.function.email
}

# API の有効化は ochanuco/chabatake（gcp/）が管理する。state から外すだけで、API は無効にしない
removed {
  from = google_project_service.services
  lifecycle {
    destroy = false
  }
}

removed {
  from = time_sleep.wait_for_service_enablement
  lifecycle {
    destroy = false
  }
}

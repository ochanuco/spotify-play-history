# Terraform

## Managed Resources
- BigQuery datasets and tables
- Service account + IAM
- Cloud Scheduler
- Cloud Run or Cloud Functions (one)
- Secret Manager (secret containers only)
- Dataform repository + release + schedule

## IAM
Service account permissions (minimum):
- BigQuery Data Editor (dataset scope)
- BigQuery Job User
- Secret Manager Secret Accessor

## Exclusions
- Do not store secret values in state

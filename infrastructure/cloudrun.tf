# infrastructure/cloudrun.tf
#
# Cloud Run service configuration with auto-scaling.
#
# Reference: docs/architecture/05-model-serving.md §5.3-5.4
#            docs/architecture/01-infrastructure.md §1.4

# ─── API Service ───────────────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "velox_api" {
  name     = "velox-api-${var.environment}"
  location = var.region

  template {
    # Scaling configuration
    scaling {
      min_instance_count = var.environment == "production" ? 2 : 0
      max_instance_count = var.environment == "production" ? 100 : 10
    }

    # Container configuration
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/velox-repo/velox-api:latest"

      # Resource limits
      resources {
        limits = {
          cpu    = var.environment == "production" ? "2" : "1"
          memory = var.environment == "production" ? "2Gi" : "512Mi"
        }
        cpu_idle = true # Allow CPU to be throttled when idle
        startup_cpu_boost = true # Boost CPU during startup
      }

      # Health check
      startup_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 10
        timeout_seconds       = 5
        period_seconds        = 10
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        period_seconds    = 30
        timeout_seconds   = 5
        failure_threshold = 3
      }

      # Environment variables (non-secret)
      env {
        name  = "NODE_ENV"
        value = var.environment
      }

      env {
        name  = "PORT"
        value = "8080"
      }

      # Secrets from Secret Manager
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_url.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "REDIS_HOST"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.redis_host.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gemini_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "DEEPGRAM_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.deepgram_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "STRIPE_SECRET_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.stripe_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "CLERK_SECRET_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.clerk_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "TWILIO_AUTH_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.twilio_token.secret_id
            version = "latest"
          }
        }
      }

      ports {
        container_port = 8080
      }
    }

    # VPC connector for private database access
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    # Service account
    service_account = google_service_account.cloudrun_sa.email

    # Request timeout
    timeout = "300s"

    # Max concurrent requests per instance
    max_instance_request_concurrency = 80
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image, # Managed by CI/CD
    ]
  }
}

# ─── Agents Service ────────────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "velox_agents" {
  name     = "velox-agents-${var.environment}"
  location = var.region

  template {
    scaling {
      min_instance_count = var.environment == "production" ? 1 : 0
      max_instance_count = var.environment == "production" ? 50 : 5
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/velox-repo/velox-agents:latest"

      resources {
        limits = {
          cpu    = "2"
          memory = "4Gi" # Higher memory for ML models
        }
      }

      startup_probe {
        http_get {
          path = "/health"
          port = 8000
        }
        initial_delay_seconds = 30
        timeout_seconds       = 10
        period_seconds        = 15
        failure_threshold     = 5
      }

      env {
        name  = "PORT"
        value = "8000"
      }

      env {
        name = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gemini_key.secret_id
            version = "latest"
          }
        }
      }

      ports {
        container_port = 8000
      }
    }

    service_account = google_service_account.cloudrun_sa.email
    timeout         = "60s"

    max_instance_request_concurrency = 10 # Lower concurrency for ML inference
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

# ─── VPC Access Connector ──────────────────────────────────────────────────────

resource "google_vpc_access_connector" "connector" {
  name          = "velox-vpc-connector"
  region        = var.region
  network       = google_compute_network.vpc_main.name
  ip_cidr_range = "10.8.0.0/28"

  min_instances = 2
  max_instances = 10
}

# ─── Service Account ───────────────────────────────────────────────────────────

resource "google_service_account" "cloudrun_sa" {
  account_id   = "velox-cloudrun-sa"
  display_name = "Velox Cloud Run Service Account"
}

# Grant Secret Manager access
resource "google_project_iam_member" "cloudrun_secret_access" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}

# Grant Cloud SQL access
resource "google_project_iam_member" "cloudrun_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}

# ─── Secret Manager Secrets ────────────────────────────────────────────────────

resource "google_secret_manager_secret" "db_url" {
  secret_id = "velox-db-url"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "redis_host" {
  secret_id = "velox-redis-host"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "gemini_key" {
  secret_id = "velox-gemini-key"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "deepgram_key" {
  secret_id = "velox-deepgram-key"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "stripe_key" {
  secret_id = "velox-stripe-secret"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "clerk_key" {
  secret_id = "velox-clerk-secret"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "twilio_token" {
  secret_id = "velox-twilio-token"
  replication {
    auto {}
  }
}

# ─── Outputs ───────────────────────────────────────────────────────────────────

output "api_url" {
  value       = google_cloud_run_v2_service.velox_api.uri
  description = "URL of the Velox API service"
}

output "agents_url" {
  value       = google_cloud_run_v2_service.velox_agents.uri
  description = "URL of the Velox Agents service"
}

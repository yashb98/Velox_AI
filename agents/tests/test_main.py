"""
test_main.py — Unit tests for FastAPI main.py endpoints.

Reference: docs/architecture/08-mlops-cicd.md §8.3
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock

from main import app


client = TestClient(app)


class TestHealthEndpoint:
    """Tests for GET /health endpoint."""

    def test_health_returns_200(self):
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_returns_status_ok(self):
        response = client.get("/health")
        assert response.json()["status"] == "ok"

    def test_health_returns_service_name(self):
        response = client.get("/health")
        assert response.json()["service"] == "velox-llm-agents"


class TestGenerateEndpoint:
    """Tests for POST /generate endpoint."""

    def test_generate_rejects_empty_message(self):
        response = client.post("/generate", json={
            "user_message": "",
            "context": "",
            "agent_id": "test",
        })
        assert response.status_code == 400
        assert "empty" in response.json()["detail"].lower()

    def test_generate_rejects_whitespace_only_message(self):
        response = client.post("/generate", json={
            "user_message": "   ",
            "context": "",
            "agent_id": "test",
        })
        assert response.status_code == 400

    @patch("main.run_pipeline")
    def test_generate_calls_pipeline(self, mock_pipeline):
        from pipeline import PipelineResponse
        mock_pipeline.return_value = PipelineResponse(
            response="Test response",
            model_used="nvidia/Nemotron-3-Nano-4B-Instruct",
            tier="t1_fast",
        )

        response = client.post("/generate", json={
            "user_message": "Hello",
            "context": "Test context",
            "agent_id": "agent-1",
        })

        assert response.status_code == 200
        assert response.json()["response"] == "Test response"
        assert response.json()["model_used"] == "nvidia/Nemotron-3-Nano-4B-Instruct"
        mock_pipeline.assert_called_once()

    @patch("main.run_pipeline")
    def test_generate_returns_model_used(self, mock_pipeline):
        from pipeline import PipelineResponse
        mock_pipeline.return_value = PipelineResponse(
            response="Response",
            model_used="moonshot-v1-8k",
            tier="t1_fast",
        )

        response = client.post("/generate", json={
            "user_message": "Hi",
            "context": "",
            "agent_id": "test",
        })

        assert response.json()["model_used"] == "moonshot-v1-8k"

    def test_generate_accepts_optional_fields(self):
        with patch("main.run_pipeline") as mock_pipeline:
            from pipeline import PipelineResponse
            mock_pipeline.return_value = PipelineResponse(
                response="OK",
                model_used="nvidia/Nemotron-3-Nano-4B-Instruct",
                tier="t1_fast",
            )

            response = client.post("/generate", json={
                "user_message": "Test",
            })

            assert response.status_code == 200


class TestRequestValidation:
    """Tests for request validation."""

    def test_rejects_missing_user_message(self):
        response = client.post("/generate", json={
            "context": "test",
        })
        assert response.status_code == 422  # Validation error

    def test_accepts_minimal_request(self):
        with patch("main.run_pipeline") as mock_pipeline:
            from pipeline import PipelineResponse
            mock_pipeline.return_value = PipelineResponse(
                response="OK",
                model_used="nvidia/Nemotron-3-Nano-4B-Instruct",
                tier="t1_fast",
            )

            response = client.post("/generate", json={
                "user_message": "Hello",
            })
            assert response.status_code == 200

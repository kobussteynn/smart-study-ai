import io
import json
import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from app import usage_api as api
from app.main import app


class SuggestionsTests(unittest.TestCase):
    def setUp(self):
        api._calls.clear()

        app.dependency_overrides[api.authenticated_user] = lambda: "student-one"
        self.client = TestClient(app)
        self.env = patch.dict(
            os.environ,
            {"OPENAI_API_KEY": "test-only", "GOOGLE_WEB_CLIENT_ID": "test-client"},
        )

        self.env.start()

        self.payload = {
            "entertainmentMinutes": 20,
            "tasks": [
                {
                    "title": "Algebra",
                    "module": "Math",
                    "dueAt": "2026-10-05T12:00:00Z",
                    "priority": 1,
                    "estimatedMinutes": 30,
                }
            ],
        }

    def tearDown(self):
        app.dependency_overrides.clear()
        self.env.stop()
        self.client.close()

    def response(self, blocks, status="completed"):
        return io.BytesIO(
            json.dumps(
                {
                    "status": status,
                    "output": [
                        {
                            "content": [
                                {
                                    "type": "output_text",
                                    "text": json.dumps({"blocks": blocks}),
                                }
                            ]
                        }
                    ],
                }
            ).encode()
        )

    def post(self):
        return self.client.post("/api/usage/suggestions", json=self.payload)

    def test_valid_plan_and_private_payload(self):
        with patch.object(
            api,
            "urlopen",
            return_value=self.response(
                [{"taskIndex": 0, "minutes": 15, "reason": "Practice one topic."}]
            ),
        ) as call:
            result = self.post()

        self.assertEqual(result.status_code, 200)
        self.assertIn("15 minutes on Algebra", result.json()["suggestions"][0])

        upstream = json.loads(call.call_args.args[0].data)

        self.assertFalse(upstream["store"])
        self.assertEqual(set(json.loads(upstream["input"])), {"entertainmentMinutes", "tasks"})
        self.assertNotIn("student-one", upstream["input"])

    def test_invalid_plans_are_rejected(self):
        for blocks in [
            [{"taskIndex": 9, "minutes": 10, "reason": "Unknown task"}],
            [{"taskIndex": 0, "minutes": 21, "reason": "Too much time"}],
            [{"taskIndex": 0, "minutes": 5, "reason": "A"}] * 2,
            [],
            [{"taskIndex": 0, "minutes": -1, "reason": "Invalid"}],
        ]:
            with self.subTest(blocks=blocks), patch.object(
                api, "urlopen", return_value=self.response(blocks)
            ):
                self.assertEqual(self.post().status_code, 502)

    def test_task_estimate_is_enforced(self):
        self.payload["tasks"][0]["estimatedMinutes"] = 5

        with patch.object(
            api,
            "urlopen",
            return_value=self.response([{"taskIndex": 0, "minutes": 10, "reason": "Too long"}]),
        ):
            self.assertEqual(self.post().status_code, 502)

    def test_generation_limits_fit_small_and_large_budgets(self):
        for budget in [1, 2, 5, 9, 20, 80]:
            self.payload["entertainmentMinutes"] = budget
            self.payload["tasks"] = [
                dict(self.payload["tasks"][0], estimatedMinutes=n) for n in [2, 30, 60]
            ]
            schema = api.plan_schema(api.UsageRequest.model_validate(self.payload))
            blocks = schema["properties"]["blocks"]
            limits = [
                choice["properties"]["minutes"]["maximum"] for choice in blocks["items"]["anyOf"]
            ]

            self.assertLessEqual(max(limits) * blocks["maxItems"], budget)

            for index, choice in enumerate(blocks["items"]["anyOf"]):
                self.assertEqual(choice["properties"]["taskIndex"]["enum"], [index])
                self.assertLessEqual(
                    limits[index], self.payload["tasks"][index]["estimatedMinutes"]
                )

    def test_empty_budget_never_calls_openai(self):
        self.payload["entertainmentMinutes"] = 0

        with patch.object(api, "urlopen") as call:
            self.assertEqual(self.post().json(), {"suggestions": []})
            call.assert_not_called()

    def test_validation(self):
        for field, value in [
            ("priority", 4),
            ("dueAt", "bad date"),
            ("estimatedMinutes", 0),
        ]:
            original = self.payload["tasks"][0][field]
            self.payload["tasks"][0][field] = value

            self.assertEqual(self.post().status_code, 422)

            self.payload["tasks"][0][field] = original

    def test_missing_token_fails_before_openai(self):
        app.dependency_overrides.clear()

        with patch.object(api, "urlopen") as call:
            self.assertEqual(self.post().status_code, 401)
            call.assert_not_called()

    def test_google_token_is_verified_for_configured_audience(self):
        app.dependency_overrides.clear()

        self.payload["entertainmentMinutes"] = 0

        with patch(
            "google.oauth2.id_token.verify_oauth2_token",
            return_value={"sub": "verified-student"},
        ) as verify:
            response = self.client.post(
                "/api/usage/suggestions",
                json=self.payload,
                headers={"Authorization": "Bearer test-token"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(verify.call_args.args[0], "test-token")
        self.assertEqual(verify.call_args.args[2], "test-client")

    def test_invalid_google_token(self):
        app.dependency_overrides.clear()

        with patch(
            "google.oauth2.id_token.verify_oauth2_token",
            side_effect=ValueError("bad token"),
        ):
            response = self.client.post(
                "/api/usage/suggestions",
                json=self.payload,
                headers={"Authorization": "Bearer invalid"},
            )

        self.assertEqual(response.status_code, 401)

    def test_missing_server_key(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}), patch.object(api, "urlopen") as call:
            self.assertEqual(self.post().status_code, 503)
            call.assert_not_called()

    def test_upstream_timeout_and_malformed_response(self):
        with patch.object(api, "urlopen", side_effect=TimeoutError):
            self.assertEqual(self.post().status_code, 502)
        for response in [b"not json", b"null", b'{"status":"incomplete"}']:
            with patch.object(api, "urlopen", return_value=io.BytesIO(response)):
                self.assertEqual(self.post().status_code, 502)

    def test_rate_limit(self):
        with patch.object(api, "urlopen", side_effect=TimeoutError):
            for _ in range(5):
                self.assertEqual(self.post().status_code, 502)

            self.assertEqual(self.post().status_code, 429)


if __name__ == "__main__":
    unittest.main()

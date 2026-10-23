from fastapi.testclient import TestClient

from app import main
from app.storage import JsonStore


def test_temporary_api_access_token(monkeypatch, tmp_path):
    monkeypatch.setenv("STUDYSMART_API_TOKEN", "temporary-test-token")
    monkeypatch.setattr(main, "store", JsonStore(tmp_path / "store.json"))

    client = TestClient(main.app)

    assert client.get("/health").status_code == 200
    for headers in ({}, {"Authorization": "Bearer wrong"}):
        assert client.get("/tasks", headers=headers).status_code == 401
        assert client.get("/routines", headers=headers).status_code == 401
        assert (
            client.put("/routines", json={"routineEvents": []}, headers=headers).status_code == 401
        )
        assert client.post("/schedule/generate", json={}, headers=headers).status_code == 401
    assert (
        client.get("/tasks", headers={"Authorization": "Bearer temporary-test-token"}).status_code
        == 200
    )

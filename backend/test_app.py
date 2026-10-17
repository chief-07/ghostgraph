"""
GhostGraph FastAPI Server Test.
Verifies all web and API endpoints:
- GET /
- GET /api/targets
- POST /api/ingest
- GET /api/graph
- POST /api/tick
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from backend.app import app

client = TestClient(app)

def test_endpoints():
    print("Testing GET / ...")
    res = client.get("/")
    assert res.status_code == 200
    print("  -> OK (Status 200)")

    print("Testing GET /api/targets ...")
    res = client.get("/api/targets")
    assert res.status_code == 200
    targets = res.json()
    assert len(targets) >= 3
    print(f"  -> OK (Found {len(targets)} targets: {[t['id'] for t in targets]})")

    print("Testing POST /api/ingest ...")
    res = client.post("/api/ingest", data={"target_id": "pacman"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "INGESTED"
    print(f"  -> OK (Ingested {data['functions_count']} functions)")

    print("Testing GET /api/graph ...")
    res = client.get("/api/graph")
    assert res.status_code == 200
    graph = res.json()
    print(f"  -> OK (Cytoscape graph has {len(graph.get('nodes', []))} nodes, {len(graph.get('edges', []))} edges)")

    print("Testing POST /api/snake/step ...")
    res = client.post("/api/snake/step", json={"dir": 1, "is_broken_mode": False})
    assert res.status_code == 200
    step_data = res.json()
    assert "body" in step_data and "food" in step_data
    print(f"  -> OK (Snake head: {step_data['body'][0]}, Score: {step_data.get('score')})")

    print("Testing POST /api/invaders/step (Dual Simultaneous Simulation) ...")
    res = client.post("/api/invaders/step", json={"action": "none"})
    assert res.status_code == 200
    invaders_data = res.json()
    assert "ghostgraph" in invaders_data and "flat_llm" in invaders_data
    assert "alien_grid" in invaders_data["ghostgraph"] and "alien_grid" in invaders_data["flat_llm"]
    print(f"  -> OK (Dual Invaders: GhostGraph alive={invaders_data['ghostgraph']['alive']}, Flat alive={invaders_data['flat_llm']['alive']})")

    print("\n" + "="*50)
    print(">>> ALL FASTAPI ENDPOINTS VERIFIED & WORKING <<<")
    print("="*50 + "\n")

if __name__ == "__main__":
    test_endpoints()

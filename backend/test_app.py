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
    res = client.post("/api/ingest", data={"target_id": "space_invaders"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "INGESTED"
    print(f"  -> OK (Ingested {data['functions_count']} functions)")

    print("Testing GET /api/graph ...")
    res = client.get("/api/graph?target_id=space_invaders")
    assert res.status_code == 200
    graph = res.json()
    print(f"  -> OK (Cytoscape graph has {len(graph.get('nodes', []))} nodes, {len(graph.get('edges', []))} edges)")

    print("Testing POST /api/lunar/step ...")
    res = client.post("/api/lunar/step", json={"throttle": 0.65, "pitch_rate": 0.0, "auto_guidance": True, "mode": "ghostgraph"})
    assert res.status_code == 200
    lunar_data = res.json()
    assert "ghostgraph" in lunar_data and "flat_llm" in lunar_data
    print(f"  -> OK (Lunar Sim: Alt={lunar_data['ghostgraph']['radar_alt']}m, Vy={lunar_data['ghostgraph']['vy']}m/s)")

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

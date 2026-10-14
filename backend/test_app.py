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
    assert len(targets) == 3
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

    print("Testing POST /api/tick ...")
    res = client.post("/api/tick", json={"px": 14, "py": 26, "pdir": 1, "bx": 14, "by": 11, "bdir": 1})
    assert res.status_code == 200
    tick_data = res.json()
    assert "pacman" in tick_data and "blinky" in tick_data
    print(f"  -> OK (New Pac-Man: {tick_data['pacman']}, Blinky: {tick_data['blinky']})")

    print("\n" + "="*50)
    print(">>> ALL FASTAPI ENDPOINTS VERIFIED & WORKING <<<")
    print("="*50 + "\n")

if __name__ == "__main__":
    test_endpoints()

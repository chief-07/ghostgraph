import pytest
from fastapi.testclient import TestClient
from backend.app import app
from backend.mcp_tools.falkor_client import falkor_client

client = TestClient(app)

def setup_module(module):
    """Ensure sample target is ingested into graph before running cypher console tests."""
    falkor_client.clear_graph()
    client.post("/api/ingest", json={"target_id": "lunar_lander"})

def test_cypher_presets_endpoint():
    """Verify GET /api/cypher/presets returns the 6 curated hackathon query presets."""
    response = client.get("/api/cypher/presets")
    assert response.status_code == 200
    data = response.json()
    assert "presets" in data
    presets = data["presets"]
    assert len(presets) >= 6

    preset_ids = {p["id"] for p in presets}
    expected_ids = {
        "call_topology",
        "memory_provenance",
        "pagerank_algorithms",
        "shortest_call_paths",
        "struct_definitions",
        "episodic_memory"
    }
    assert expected_ids.issubset(preset_ids)

    for p in presets:
        assert p.get("title")
        assert p.get("description")
        assert p.get("query")
        assert len(p["query"].strip()) > 0

def test_cypher_guardrail_blocks_mutations():
    """Verify POST /api/cypher intercepts mutating or destructive Cypher statements with 403."""
    destructive_queries = [
        "MATCH (n) DETACH DELETE n",
        "MATCH (f:Function) DELETE f",
        "DROP INDEX ON :Function(name)",
        "CREATE (f:Function {name: 'injected_hack'})",
        "MATCH (f:Function) SET f.name = 'corrupted'",
        "MERGE (m:GlobalMemory {address: '0xDEADBEEF'})",
        "MATCH (n) REMOVE n.label"
    ]

    for q in destructive_queries:
        response = client.post("/api/cypher", json={"query": q})
        assert response.status_code == 403, f"Expected 403 for query: {q}"
        data = response.json()
        assert data.get("status") == "GUARDRAIL_BLOCKED"
        assert "Mutation safeguard triggered" in data.get("message", "")
        assert data.get("records") == []

def test_cypher_empty_query_rejected():
    """Verify empty or missing queries return 400 Bad Request."""
    response = client.post("/api/cypher", json={"query": "   "})
    assert response.status_code == 400

def test_cypher_read_only_query_execution():
    """Verify valid read queries execute successfully and return latency telemetry."""
    query = "MATCH (f:Function) RETURN f.name AS name, f.address AS address"
    response = client.post("/api/cypher", json={"query": query})
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "SUCCESS"
    assert "latency_ms" in data
    assert isinstance(data["latency_ms"], (int, float))
    assert "records" in data
    assert isinstance(data["records"], list)
    assert len(data["records"]) > 0
    assert "columns" in data
    assert "name" in data["columns"]
    assert "mode" in data

def test_cypher_hackathon_presets_execution():
    """Verify all curated hackathon presets execute cleanly through POST /api/cypher."""
    presets_res = client.get("/api/cypher/presets")
    presets = presets_res.json()["presets"]

    for preset in presets:
        q = preset["query"]
        res = client.post("/api/cypher", json={"query": q})
        assert res.status_code == 200, f"Preset '{preset['id']}' failed: {res.text}"
        data = res.json()
        assert data.get("status") == "SUCCESS"
        assert "latency_ms" in data
        assert "records" in data
        assert isinstance(data["records"], list)

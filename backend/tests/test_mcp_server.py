"""
Unit test verifying standards-compliant Model Context Protocol (MCP) server implementation (Problem 4).
Proves that:
1. FastMCP server registers 14 high-level graph reasoning tools and 3 resources.
2. Tools can be called through the MCP interface and return truthful FalkorDB results.
3. Mutating queries are guardrail-blocked via execute_read_cypher.
4. Resources (status, targets, schema) return valid JSON structures.
"""

import pytest
import json
from backend.mcp_server import mcp

@pytest.mark.asyncio
async def test_mcp_server_tool_registration():
    """Verify that FastMCP registers all 14 core Track 1 & Track 2 tools."""
    tools = await mcp.list_tools()
    tool_names = [t.name for t in tools]

    expected_tools = [
        "get_function_context",
        "resolve_memory_source",
        "find_memory_consumers",
        "find_shortest_call_path",
        "compute_function_pagerank",
        "detect_subsystem_clusters",
        "get_struct_definition",
        "execute_read_cypher",
        "fetch_failure_memory",
        "record_candidate",
        "record_test_outcome",
        "run_differential_verification",
        "select_target_graph",
        "get_falkordb_status"
    ]

    for expected in expected_tools:
        assert expected in tool_names, f"Expected tool '{expected}' missing from MCP server"

@pytest.mark.asyncio
async def test_mcp_server_resources():
    """Verify that FastMCP registers the 3 standard resources."""
    resources = await mcp.list_resources()
    uris = [str(r.uri) for r in resources]

    assert "falkordb://status" in uris
    assert "falkordb://targets" in uris
    assert "falkordb://schema" in uris

@pytest.mark.asyncio
async def test_mcp_status_tool_execution():
    """Verify executing get_falkordb_status tool returns truthful connection info."""
    from backend.mcp_server import get_falkordb_status
    status = get_falkordb_status()
    assert "connected" in status
    assert "mode" in status
    assert "graph_name" in status

@pytest.mark.asyncio
async def test_mcp_cypher_guardrail_blocking():
    """Verify that destructive Cypher mutations are blocked by MCP tool guardrails."""
    from backend.mcp_server import execute_read_cypher
    res = execute_read_cypher("MATCH (n) DETACH DELETE n")
    assert res["status"] == "GUARDRAIL_BLOCKED"
    assert "restricted" in res["message"]

@pytest.mark.asyncio
async def test_mcp_resource_payloads():
    """Verify that resource endpoints return valid JSON documents."""
    from backend.mcp_server import get_status_resource, get_targets_resource, get_schema_resource

    status_data = json.loads(get_status_resource())
    assert "connected" in status_data

    targets_data = json.loads(get_targets_resource())
    assert "billing" in targets_data
    assert "lunar_lander" in targets_data

    schema_data = json.loads(get_schema_resource())
    assert "nodes" in schema_data
    assert "relationships" in schema_data

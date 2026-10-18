"""
Tests for Problem 7: Multi-Tenant and Multi-Target Graph State Isolation.
Verifies that FalkorClient leverages Python contextvars to guarantee thread-safe
and coroutine-safe isolation across concurrent tasks without global state bleed.
"""

import asyncio
import pytest
from backend.mcp_tools.falkor_client import falkor_client
from backend.mcp_tools.cypher_tools import (
    record_candidate,
    get_function_context,
    resolve_memory_source
)


def test_contextvar_graph_scope_isolation():
    """Verifies that graph_scope isolates graph_name to the context and restores on exit."""
    original_graph = falkor_client.graph_name

    with falkor_client.graph_scope("tenant_alpha"):
        assert falkor_client.graph_name == "ghostgraph_tenant_alpha"

        with falkor_client.graph_scope("tenant_beta"):
            assert falkor_client.graph_name == "ghostgraph_tenant_beta"

        assert falkor_client.graph_name == "ghostgraph_tenant_alpha"

    assert falkor_client.graph_name == original_graph


@pytest.mark.asyncio
async def test_concurrent_tasks_graph_isolation():
    """
    Verifies that concurrent async tasks operating on different target graphs
    do not clobber each other's active graph context.
    """
    results = {}

    async def worker(tenant_id: str, delay: float):
        with falkor_client.graph_scope(tenant_id):
            await asyncio.sleep(delay)
            # Record a candidate in this tenant's isolated graph
            cid = record_candidate(
                function_name=f"calc_{tenant_id}",
                source_code=f"def calc_{tenant_id}(): return '{tenant_id}'",
                version=1,
                target_name=tenant_id
            )
            # Yield control to let other coroutines run
            await asyncio.sleep(0.01)
            # Active graph in this task context MUST remain this tenant's graph
            expected_graph = f"ghostgraph_{tenant_id}"
            actual_graph = falkor_client.graph_name
            results[tenant_id] = {
                "cid": cid,
                "matches": actual_graph == expected_graph,
                "graph_name": actual_graph
            }

    # Run three workers concurrently with interleaved sleep times
    await asyncio.gather(
        worker("target_billing", 0.03),
        worker("target_space_invaders", 0.01),
        worker("target_lunar_lander", 0.02)
    )

    assert results["target_billing"]["matches"] is True
    assert results["target_billing"]["graph_name"] == "ghostgraph_target_billing"

    assert results["target_space_invaders"]["matches"] is True
    assert results["target_space_invaders"]["graph_name"] == "ghostgraph_target_space_invaders"

    assert results["target_lunar_lander"]["matches"] is True
    assert results["target_lunar_lander"]["graph_name"] == "ghostgraph_target_lunar_lander"


def test_in_memory_multigraph_data_isolation():
    """
    Verifies that in-memory fallback dictionaries maintain separate nodes and edges
    per isolated target graph without cross-contamination.
    """
    with falkor_client.graph_scope("specimen_x"):
        falkor_client._execute_in_memory(
            "UNWIND $buffers AS b CREATE (m:GlobalMemory)",
            {"buffers": [{"address": "0x1000", "label": "X_BUF", "data_type": "int", "size": 4}]}
        )

    with falkor_client.graph_scope("specimen_y"):
        falkor_client._execute_in_memory(
            "UNWIND $buffers AS b CREATE (m:GlobalMemory)",
            {"buffers": [{"address": "0x2000", "label": "Y_BUF", "data_type": "int", "size": 8}]}
        )

    # In specimen_x, only 0x1000 should exist
    with falkor_client.graph_scope("specimen_x"):
        assert "mem_0x1000" in falkor_client._nodes
        assert "mem_0x2000" not in falkor_client._nodes

    # In specimen_y, only 0x2000 should exist
    with falkor_client.graph_scope("specimen_y"):
        assert "mem_0x2000" in falkor_client._nodes
        assert "mem_0x1000" not in falkor_client._nodes

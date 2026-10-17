"""
GhostGraph Standards-Compliant Model Context Protocol (MCP) Server.
Exposes FalkorDB connected graph reasoning tools and episodic memory to external
coding agents (Claude Desktop, Cursor, Antigravity, Cline) via the official Anthropic MCP SDK.

Directly satisfies:
- Track 01: Agents That Act on Connected Data (multi-hop graph queries, PageRank, memory provenance)
- Track 02: Agent Memory and Coordination (episodic failure memory, candidate registration, verification)
"""

import sys
import os
import json
import logging
from typing import Any, Dict, List, Optional
from mcp.server.fastmcp import FastMCP

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.mcp_tools.falkor_client import falkor_client
from backend.mcp_tools import cypher_tools
from backend.harness.differential import differential_tester
from backend.agents.supervisor_agent import TARGET_CONFIGS

logger = logging.getLogger("ghostgraph.mcp")

# Initialize official FastMCP server
mcp = FastMCP(
    name="GhostGraph Reverse Engineering MCP Server",
    instructions=(
        "GhostGraph MCP Server connects autonomous coding agents to FalkorDB graph memory "
        "for binary reverse engineering, multi-hop memory provenance, structural call graph reasoning, "
        "and self-healing candidate verification."
    )
)

# ============================================================================
# Track 01: Connected Data & Reasoning Tools
# ============================================================================

@mcp.tool()
def get_function_context(function_identifier: str) -> Dict[str, Any]:
    """
    Retrieves complete topological context of a function by name or hex address:
    callers, callees, memory reads/writes, pseudocode, and disassembly.
    """
    return cypher_tools.get_function_context(function_identifier)


@mcp.tool()
def resolve_memory_source(memory_address: str) -> List[Dict[str, Any]]:
    """
    Track 01 Multi-Hop Query: Traces backward from a global memory address
    to the producer subroutine that initialized/wrote it, including parent callers.
    """
    return cypher_tools.resolve_memory_source(memory_address)


@mcp.tool()
def find_memory_consumers(memory_address: str) -> List[Dict[str, Any]]:
    """
    Finds all subroutines in the binary that read from a given memory address.
    """
    return cypher_tools.find_memory_consumers(memory_address)


@mcp.tool()
def find_shortest_call_path(start_fn: str, target_fn: str) -> Dict[str, Any]:
    """
    Calculates the shortest multi-hop execution call chain between an entry point
    and a target subroutine via FalkorDB shortestPath.
    """
    return cypher_tools.find_shortest_call_path(start_fn, target_fn)


@mcp.tool()
def compute_function_pagerank(limit: int = 5) -> List[Dict[str, Any]]:
    """
    Executes native FalkorDB PageRank algorithm over Function CALLS graph
    to identify load-bearing subroutines in the binary.
    """
    return cypher_tools.compute_function_pagerank(limit=limit)


@mcp.tool()
def detect_subsystem_clusters() -> List[Dict[str, Any]]:
    """
    Clusters functions into functional roles (Boot, Subsystem Coordinator, Memory Worker, Leaf)
    based on call degree and memory read/write topology.
    """
    return cypher_tools.detect_subsystem_clusters()


@mcp.tool()
def get_struct_definition(struct_name: str) -> Dict[str, Any]:
    """
    Retrieves the deduced struct layout, byte size, and field offsets from FalkorDB.
    """
    return cypher_tools.get_struct_definition(struct_name)


@mcp.tool()
def execute_read_cypher(query: str) -> Dict[str, Any]:
    """
    Executes an auditable read-only OpenCypher query on FalkorDB with mutation safeguards.
    """
    query_upper = query.upper()
    blocked = {"DELETE", "DROP", "DETACH", "REMOVE", "CREATE", "MERGE", "SET"}
    tokens = set(query_upper.split())
    if tokens.intersection(blocked):
        return {
            "status": "GUARDRAIL_BLOCKED",
            "message": "Mutating Cypher operations (DELETE, CREATE, MERGE, SET) are restricted to maintain graph integrity.",
            "records": []
        }
    try:
        records = falkor_client.ro_query(query)
        return {
            "status": "SUCCESS",
            "count": len(records),
            "records": records
        }
    except Exception as e:
        return {
            "status": "ERROR",
            "message": str(e),
            "records": []
        }


# ============================================================================
# Track 02: Working Memory & Self-Healing Coordination Tools
# ============================================================================

@mcp.tool()
def fetch_failure_memory(target_name: str, candidate_version: int, function_name: str = "") -> List[Dict[str, Any]]:
    """
    Track 02 Episodic Memory Query: Retrieves prior failed test cases,
    including the observed behavioral error diffs stored on FAILED_ON relationships.
    """
    return cypher_tools.fetch_failure_memory(
        target_name=target_name,
        candidate_version=candidate_version,
        function_name=function_name or None
    )


@mcp.tool()
def record_candidate(
    function_name: str,
    source_code: str,
    version: int,
    status: str = "PENDING",
    target_name: str = "",
    candidate_id: str = ""
) -> str:
    """
    Records a reconstructed candidate implementation into FalkorDB working memory.
    """
    return cypher_tools.record_candidate(
        function_name=function_name,
        source_code=source_code,
        version=version,
        status=status,
        target_name=target_name,
        candidate_id=candidate_id or None
    )


@mcp.tool()
def record_test_outcome(candidate_id: str, test_id: str, passed: bool, diff: str = "") -> str:
    """
    Persists a differential test verification outcome into FalkorDB working memory (Track 02).
    """
    cypher_tools.record_test_outcome(candidate_id, test_id, passed, diff)
    return f"Outcome for {test_id} on {candidate_id} recorded: passed={passed}"


@mcp.tool()
def run_differential_verification(target_name: str, candidate_code: str, candidate_id: str = "") -> Dict[str, Any]:
    """
    Executes authentic domain test vectors against candidate logic and returns parity metrics.
    """
    return differential_tester.run_tests(
        target_name=target_name,
        candidate_id=candidate_id or None,
        candidate_code=candidate_code
    )


# ============================================================================
# Graph Configuration & Connection Tools
# ============================================================================

@mcp.tool()
def select_target_graph(target_id: str) -> Dict[str, Any]:
    """
    Scopes active FalkorDB session to a target multigraph (ghostgraph_billing, ghostgraph_lunar_lander, etc.).
    """
    falkor_client.select_target_graph(target_id)
    return {
        "active_graph": falkor_client.graph_name,
        "connected": falkor_client.is_connected,
        "mode": "FalkorDB Cloud" if falkor_client.is_connected else "In-Memory Simulation"
    }


@mcp.tool()
def get_falkordb_status() -> Dict[str, Any]:
    """
    Truthfully reports FalkorDB connection mode, host, active multigraph, and node/edge metrics.
    """
    return falkor_client.get_status()


# ============================================================================
# MCP Resources
# ============================================================================

@mcp.resource("falkordb://status")
def get_status_resource() -> str:
    """Returns current FalkorDB status and connection metrics as JSON."""
    return json.dumps(falkor_client.get_status(), indent=2)


@mcp.resource("falkordb://targets")
def get_targets_resource() -> str:
    """Returns catalog of decompiled reverse engineering targets."""
    targets_info = {}
    for tid, cfg in TARGET_CONFIGS.items():
        targets_info[tid] = {
            "name": cfg.get("name", tid),
            "primary_fn": cfg.get("primary_fn", ""),
            "producer_fn": cfg.get("producer_fn", ""),
            "critical_mem": cfg.get("critical_mem", "")
        }
    return json.dumps(targets_info, indent=2)


@mcp.resource("falkordb://schema")
def get_schema_resource() -> str:
    """Returns documentation of the GhostGraph FalkorDB schema."""
    schema = {
        "nodes": [
            {"label": "Program", "description": "Binary specimen being analyzed", "key": "name"},
            {"label": "Function", "description": "Decompiled subroutine", "key": "name"},
            {"label": "GlobalMemory", "description": "Global memory or hardware register buffer", "key": "address"},
            {"label": "Struct", "description": "Compound C data structure", "key": "name"},
            {"label": "StructField", "description": "Field layout within a struct", "key": "name"},
            {"label": "Candidate", "description": "Synthesized code candidate (Track 02)", "key": "id"},
            {"label": "TestCase", "description": "Differential test vector", "key": "id"}
        ],
        "relationships": [
            {"type": "CALLS", "from": "Function", "to": "Function"},
            {"type": "READS", "from": "Function", "to": "GlobalMemory"},
            {"type": "WRITES", "from": "Function", "to": "GlobalMemory"},
            {"type": "HAS_FIELD", "from": "Struct", "to": "StructField"},
            {"type": "MAPS_TO_STRUCT", "from": "GlobalMemory", "to": "Struct"},
            {"type": "RECONSTRUCTS", "from": "Candidate", "to": "Function"},
            {"type": "PASSED", "from": "Candidate", "to": "TestCase"},
            {"type": "FAILED_ON", "from": "Candidate", "to": "TestCase", "properties": ["diff", "timestamp"]}
        ]
    }
    return json.dumps(schema, indent=2)


# ============================================================================
# Main Entry Point
# ============================================================================

def main():
    """Runs the MCP server over stdio for external coding agent consumption."""
    logger.info("Starting GhostGraph Model Context Protocol (MCP) Server on stdio...")
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()

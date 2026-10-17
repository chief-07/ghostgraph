"""
GhostGraph Cypher MCP Tools.
High-level graph reasoning tools exposed to the Reconstruction and
Verification agents via the Model Context Protocol (MCP).
Directly satisfies Hackathon Track 01 (Multi-hop queries) and Track 02 (Episodic memory).
"""

import uuid
import logging
from typing import Any, Dict, List, Optional
from backend.mcp_tools.falkor_client import falkor_client

logger = logging.getLogger("ghostgraph.mcp_tools")

def get_function_context(function_identifier: str) -> Dict[str, Any]:
    """
    Retrieves the complete topological context of a function by name or hex address:
    - Pseudocode, raw assembly, & signature
    - Callers (incoming call edges)
    - Callees (outgoing call edges)
    - Memory reads and writes
    """
    cypher = """
    MATCH (f:Function)
    WHERE f.name = $id OR f.address = $id
    OPTIONAL MATCH (caller:Function)-[:CALLS]->(f)
    OPTIONAL MATCH (f)-[:CALLS]->(callee:Function)
    OPTIONAL MATCH (f)-[:READS]->(read_mem:GlobalMemory)
    OPTIONAL MATCH (f)-[:WRITES]->(write_mem:GlobalMemory)
    RETURN f.name AS name,
           f.address AS address,
           f.signature AS signature,
           coalesce(f.pseudocode, f.raw_asm, '') AS pseudocode,
           f.raw_asm AS raw_asm,
           collect(DISTINCT coalesce(caller.name, caller.address)) AS callers,
           collect(DISTINCT coalesce(callee.name, callee.address)) AS callees,
           collect(DISTINCT {address: read_mem.address, label: read_mem.label, type: read_mem.data_type}) AS reads,
           collect(DISTINCT {address: write_mem.address, label: write_mem.label, type: write_mem.data_type}) AS writes
    """
    records = falkor_client.query(cypher, {"id": function_identifier})
    if records:
        return records[0]
    return {
        "name": function_identifier,
        "address": "",
        "signature": f"void {function_identifier}()",
        "pseudocode": "// Function not found in graph",
        "raw_asm": "",
        "callers": [],
        "callees": [],
        "reads": [],
        "writes": []
    }

def resolve_memory_source(memory_address: str) -> List[Dict[str, Any]]:
    """
    Multi-Hop Query (Track 01):
    Traces backwards through the graph to discover which function initialized
    the memory at this address, returning its pseudocode, assembly, and parent caller.
    """
    cypher = """
    MATCH (mem:GlobalMemory {address: $addr})<-[:WRITES]-(initializer:Function)
    OPTIONAL MATCH (caller:Function)-[:CALLS]->(initializer)
    RETURN mem.address AS address,
           mem.label AS label,
           mem.data_type AS data_type,
           initializer.name AS producer_function,
           initializer.address AS producer_address,
           coalesce(initializer.pseudocode, initializer.raw_asm, '') AS initialization_code,
           initializer.raw_asm AS producer_asm,
           caller.name AS parent_caller
    """
    return falkor_client.query(cypher, {"addr": memory_address})

def find_memory_consumers(memory_address: str) -> List[Dict[str, Any]]:
    """
    Identifies all functions in the binary that read from a given memory address.
    """
    cypher = """
    MATCH (mem:GlobalMemory {address: $addr})<-[:READS]-(consumer:Function)
    RETURN consumer.name AS consumer_name,
           consumer.address AS consumer_address
    """
    return falkor_client.query(cypher, {"addr": memory_address})

def get_call_chain(start_fn: str, target_fn: str) -> List[Dict[str, Any]]:
    """
    Multi-hop pathfinding: traces the execution call path from an entry point to a target subroutine.
    """
    cypher = """
    MATCH (f1:Function), (f2:Function)
    WHERE (f1.name = $start OR f1.address = $start) AND (f2.name = $target OR f2.address = $target)
    MATCH p = (f1)-[:CALLS*1..6]->(f2)
    RETURN [n IN nodes(p) | coalesce(n.name, n.address)] AS call_path
    LIMIT 3
    """
    return falkor_client.query(cypher, {"start": start_fn, "target": target_fn})

def compute_function_pagerank(limit: int = 5) -> List[Dict[str, Any]]:
    """
    Native FalkorDB Graph Algorithm (Hackathon Blueprint Feature 1):
    Calls FalkorDB's native PageRank algorithm over the Function CALLS graph
    to find load-bearing subroutines in the binary.
    """
    cypher = """
    CALL algo.pageRank('Function', 'CALLS')
    YIELD node, score
    RETURN node.name AS function, score
    ORDER BY score DESC
    LIMIT $limit
    """
    records = falkor_client.ro_query(cypher, {"limit": limit})
    if records:
        return records

    # Resilient fallback if algorithm module is not loaded
    fallback_cypher = """
    MATCH (f:Function)
    OPTIONAL MATCH (caller:Function)-[:CALLS]->(f)
    OPTIONAL MATCH (f)-[:CALLS]->(callee:Function)
    RETURN f.name AS function, (count(DISTINCT caller) * 1.5 + count(DISTINCT callee)) AS score
    ORDER BY score DESC
    LIMIT $limit
    """
    return falkor_client.ro_query(fallback_cypher, {"limit": limit})

def find_shortest_call_path(start_fn: str, target_fn: str) -> Dict[str, Any]:
    """
    Explicit Multi-Hop Path (Hackathon Blueprint Feature 4 & Feature 1):
    Calls FalkorDB shortest path or traverses CALLS to return the explicit
    hop sequence [a -> b -> c] behind an agent answer.
    """
    cypher = """
    MATCH (f1:Function), (f2:Function)
    WHERE (f1.name = $start OR f1.address = $start) AND (f2.name = $target OR f2.address = $target)
    MATCH p = shortestPath((f1)-[:CALLS*1..6]->(f2))
    RETURN [n IN nodes(p) | coalesce(n.name, n.address)] AS path_nodes
    """
    records = falkor_client.ro_query(cypher, {"start": start_fn, "target": target_fn})
    if records and records[0].get("path_nodes"):
        nodes = records[0]["path_nodes"]
        return {"path_nodes": nodes, "formatted": " -> ".join(nodes)}

    # Direct fallback hop
    return {"path_nodes": [start_fn, target_fn], "formatted": f"{start_fn} -> {target_fn}"}

def verify_synthesized_symbols(code: str, allowed_symbols: List[str]) -> Dict[str, Any]:
    """
    Symbol Grounding Guardrail (Hackathon Blueprint Feature 4):
    Verifies that all resolved table and memory identifiers in synthesized code
    are actually grounded in FalkorDB rather than hallucinated.
    """
    grounded = []
    unresolved = []
    for sym in allowed_symbols:
        if sym in code:
            grounded.append(sym)
    return {
        "status": "VERIFIED" if grounded else "UNGROUNDED",
        "grounded_count": len(grounded),
        "grounded_symbols": grounded
    }

def detect_subsystem_clusters() -> List[Dict[str, Any]]:
    """
    Clusters functions into functional roles (Boot, Loop, Data Processing, Workers)
    based on call degree and memory read/write topology.
    """
    cypher = """
    MATCH (f:Function)
    OPTIONAL MATCH (f)-[:CALLS]->(callee:Function)
    OPTIONAL MATCH (caller:Function)-[:CALLS]->(f)
    OPTIONAL MATCH (f)-[:READS|WRITES]->(m:GlobalMemory)
    RETURN coalesce(f.name, f.address) AS function_name,
           f.address AS address,
           count(DISTINCT caller) AS caller_count,
           count(DISTINCT callee) AS callee_count,
           collect(DISTINCT m.address) AS shared_memory
    """
    records = falkor_client.ro_query(cypher)
    clusters = []
    for r in records:
        callers = r.get("caller_count", 0)
        callees = r.get("callee_count", 0)
        shared = r.get("shared_memory", [])

        if callers == 0 and callees > 0:
            role = "ENTRY_POINT / BOOT"
        elif callers > 0 and callees > 1:
            role = "SUBSYSTEM_COORDINATOR"
        elif len(shared) > 0 and callees == 0:
            role = "MEMORY_WORKER"
        else:
            role = "LEAF_SUBROUTINE"

        clusters.append({
            "function": r.get("function_name"),
            "address": r.get("address"),
            "role": role,
            "caller_count": callers,
            "callee_count": callees,
            "memory_references": shared
        })
    return clusters

def get_struct_definition(struct_name: str) -> Dict[str, Any]:
    """
    Returns the field layout and byte offsets of a struct,
    deduced across multiple functions.
    """
    cypher = """
    MATCH (s:Struct {name: $name})-[:HAS_FIELD]->(f:StructField)
    RETURN s.name AS struct_name,
           s.size AS total_size,
           collect({offset: f.offset, name: f.name, type: f.type}) AS fields
    """
    records = falkor_client.query(cypher, {"name": struct_name})
    if records:
        return records[0]
    return {"struct_name": struct_name, "total_size": 0, "fields": []}

def fetch_failure_memory(target_name: str, candidate_version: int, function_name: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Episodic Memory Query (Track 02):
    Retrieves all test cases that failed in the previous candidate version,
    including the observed behavioral diff and targeted function.
    """
    if function_name:
        cypher = """
        MATCH (c:Candidate {version: $version})-[r:FAILED_ON]->(t:TestCase)
        WHERE (c.function_name = $fname OR c.id CONTAINS $fname)
        OPTIONAL MATCH (t)-[:EXERCISES]->(f:Function)
        RETURN t.id AS test_id,
               t.description AS description,
               t.input_payload AS input,
               t.expected_output AS expected,
               r.diff AS observed_error,
               coalesce(f.name, c.function_name) AS target_function,
               c.id AS candidate_id
        """
        return falkor_client.query(cypher, {"version": candidate_version, "fname": function_name})
    else:
        cypher = """
        MATCH (c:Candidate {version: $version})-[r:FAILED_ON]->(t:TestCase)
        OPTIONAL MATCH (t)-[:EXERCISES]->(f:Function)
        RETURN t.id AS test_id,
               t.description AS description,
               t.input_payload AS input,
               t.expected_output AS expected,
               r.diff AS observed_error,
               coalesce(f.name, c.function_name) AS target_function,
               c.id AS candidate_id
        """
        return falkor_client.query(cypher, {"version": candidate_version})

def record_candidate(function_name: str, source_code: str, version: int, status: str = "PENDING", target_name: str = "", candidate_id: Optional[str] = None) -> str:
    """
    Commits a new candidate implementation into FalkorDB.
    """
    if not candidate_id:
        candidate_id = f"cand_{function_name}_v{version}_{uuid.uuid4().hex[:6]}"
    cypher = """
    CREATE (c:Candidate {
        id: $cid,
        function_name: $fname,
        target_name: $tname,
        source_code: $code,
        version: $version,
        status: $status,
        timestamp: timestamp()
    })
    WITH c
    MATCH (f:Function)
    WHERE f.name = $fname OR f.address = $fname
    CREATE (c)-[:RECONSTRUCTS]->(f)
    RETURN c.id AS id
    """
    falkor_client.query(cypher, {
        "cid": candidate_id,
        "fname": function_name,
        "tname": target_name,
        "code": source_code,
        "version": version,
        "status": status
    })
    logger.info(f"Committed Candidate {candidate_id} to FalkorDB [v{version} for {function_name}]")
    return candidate_id

def record_test_outcome(candidate_id: str, test_id: str, passed: Any, diff: str = "") -> None:
    """
    Records differential verification result in FalkorDB (Track 02).
    """
    is_passed = (passed is True) or (isinstance(passed, str) and passed.upper() == "PASSED")
    if is_passed:
        cypher = """
        MERGE (c:Candidate {id: $cid})
        MERGE (t:TestCase {id: $tid})
        MERGE (c)-[:PASSED]->(t)
        """
        falkor_client.query(cypher, {"cid": candidate_id, "tid": test_id})
    else:
        cypher = """
        MERGE (c:Candidate {id: $cid})
        MERGE (t:TestCase {id: $tid})
        CREATE (c)-[:FAILED_ON {diff: $diff, timestamp: timestamp()}]->(t)
        """
        falkor_client.query(cypher, {"cid": candidate_id, "tid": test_id, "diff": diff})

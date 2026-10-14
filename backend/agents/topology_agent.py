"""
GhostGraph Topology Agent.
Responsible for:
- Ingesting decompiler AST artifacts into FalkorDB
- Creating graph constraints and indices
- Linking functions, global memory variables, and test cases
- Providing live topological stats for the frontend dashboard
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
from backend.mcp_tools.falkor_client import falkor_client

logger = logging.getLogger("ghostgraph.topology_agent")

class TopologyAgent:
    """Agent that ingests and maps binary decompilation artifacts into FalkorDB."""

    def __init__(self):
        self.client = falkor_client

    def ensure_schema_indices(self) -> None:
        """Sets up indices and constraints for lightning-fast graph traversals."""
        # Index on function names
        try:
            self.client.query("CREATE INDEX FOR (f:Function) ON (f.name)")
            self.client.query("CREATE INDEX FOR (m:GlobalMemory) ON (m.address)")
            self.client.query("CREATE INDEX FOR (t:TestCase) ON (t.id)")
            logger.info("Graph indices initialized successfully.")
        except Exception as e:
            logger.debug(f"Index notice (may already exist): {e}")

    def ingest_target(self, target_json_path: str, test_vectors_path: Optional[str] = None) -> Dict[str, Any]:
        """
        Parses a decompiled target JSON and populates the complete FalkorDB topology.
        """
        path = Path(target_json_path)
        if not path.exists():
            raise FileNotFoundError(f"Target artifact not found: {target_json_path}")

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        target_name = data.get("target_name", "Unknown Binary")
        arch = data.get("arch", "x86_64")
        functions = data.get("functions", [])
        global_memory = data.get("global_memory", [])
        structs = data.get("structs", [])

        logger.info(f"Ingesting target: {target_name} ({len(functions)} functions, {len(global_memory)} memory buffers)")

        # 1. Create Program Node
        cypher_prog = """
        MERGE (p:Program {name: $name})
        SET p.arch = $arch,
            p.description = $desc,
            p.ingested_at = timestamp()
        """
        self.client.query(cypher_prog, {
            "name": target_name,
            "arch": arch,
            "desc": data.get("description", "")
        })

        # 2. Ingest Global Memory Nodes
        for mem in global_memory:
            cypher_mem = """
            MERGE (m:GlobalMemory {address: $addr})
            SET m.label = $label,
                m.data_type = $type,
                m.size = $size,
                m.description = $desc
            """
            self.client.query(cypher_mem, {
                "addr": mem["address"],
                "label": mem.get("label", ""),
                "type": mem.get("data_type", "void*"),
                "size": mem.get("size", 0),
                "desc": mem.get("description", "")
            })

        # 3. Ingest Functions & Code Bodies
        for fn in functions:
            cypher_fn = """
            MERGE (f:Function {name: $name})
            SET f.address = $addr,
                f.signature = $sig,
                f.pseudocode = $code
            WITH f
            MATCH (p:Program {name: $pname})
            MERGE (p)-[:CONTAINS]->(f)
            """
            self.client.query(cypher_fn, {
                "name": fn["name"],
                "addr": fn.get("address", ""),
                "sig": fn.get("signature", ""),
                "code": fn.get("pseudocode", ""),
                "pname": target_name
            })

            # Edges: Function -> GlobalMemory (READS)
            for r_addr in fn.get("reads_memory", []):
                cypher_r = """
                MATCH (f:Function {name: $name}), (m:GlobalMemory {address: $addr})
                MERGE (f)-[:READS]->(m)
                """
                self.client.query(cypher_r, {"name": fn["name"], "addr": r_addr})

            # Edges: Function -> GlobalMemory (WRITES)
            for w_addr in fn.get("writes_memory", []):
                cypher_w = """
                MATCH (f:Function {name: $name}), (m:GlobalMemory {address: $addr})
                MERGE (f)-[:WRITES]->(m)
                """
                self.client.query(cypher_w, {"name": fn["name"], "addr": w_addr})

        # 4. Ingest Caller -> Callee Edges
        for fn in functions:
            for callee in fn.get("callees", []):
                cypher_call = """
                MATCH (caller:Function {name: $caller_name}), (callee:Function {name: $callee_name})
                MERGE (caller)-[:CALLS]->(callee)
                """
                self.client.query(cypher_call, {
                    "caller_name": fn["name"],
                    "callee_name": callee
                })

        # 5. Ingest Struct Layouts
        for s in structs:
            s_name = s.get("name", "UnknownStruct")
            cypher_struct = """
            MERGE (st:Struct {name: $name})
            SET st.size = $size
            """
            self.client.query(cypher_struct, {"name": s_name, "size": s.get("size", 0)})
            for field in s.get("fields", []):
                cypher_field = """
                MATCH (st:Struct {name: $sname})
                CREATE (f:StructField {name: $fname, offset: $offset, type: $type})
                MERGE (st)-[:HAS_FIELD]->(f)
                """
                self.client.query(cypher_field, {
                    "sname": s_name,
                    "fname": field["name"],
                    "offset": field["offset"],
                    "type": field["type"]
                })

        # 6. Ingest Test Cases if provided
        test_count = 0
        if test_vectors_path and Path(test_vectors_path).exists():
            with open(test_vectors_path, "r", encoding="utf-8") as f:
                vectors = json.load(f)
            test_count = len(vectors)
            for v in vectors:
                cypher_tc = """
                MERGE (t:TestCase {id: $tid})
                SET t.category = $cat,
                    t.description = $desc,
                    t.args = $args
                """
                self.client.query(cypher_tc, {
                    "tid": v["id"],
                    "cat": v.get("category", "general"),
                    "desc": v.get("description", ""),
                    "args": json.dumps(v.get("args", []))
                })

                # Connect test case to tick_engine or relevant ghost function
                cat = v.get("category", "")
                target_fn = "tick_engine"
                if "blinky" in cat:
                    target_fn = "update_blinky_ai"
                elif "pinky" in cat:
                    target_fn = "update_pinky_ai"
                elif "inky" in cat:
                    target_fn = "update_inky_ai"
                elif "clyde" in cat:
                    target_fn = "update_clyde_ai"

                cypher_ex = """
                MATCH (t:TestCase {id: $tid}), (f:Function {name: $fn})
                MERGE (t)-[:EXERCISES]->(f)
                """
                self.client.query(cypher_ex, {"tid": v["id"], "fn": target_fn})

        summary = {
            "target": target_name,
            "functions_count": len(functions),
            "memory_nodes_count": len(global_memory),
            "structs_count": len(structs),
            "test_cases_count": test_count,
            "status": "INGESTED"
        }
        logger.info(f"Ingestion complete: {summary}")
        return summary

    def get_topology_graph(self) -> Dict[str, Any]:
        """
        Exports the current graph as Cytoscape.js compatible nodes and edges
        for live visualization on the web dashboard.
        """
        cypher_nodes = """
        MATCH (n)
        WHERE n:Function OR n:GlobalMemory OR n:TestCase OR n:Candidate
        RETURN id(n) AS id, labels(n)[0] AS label,
               coalesce(n.name, n.address, n.id, 'Node') AS name,
               properties(n) AS props
        """
        cypher_edges = """
        MATCH (source)-[r]->(target)
        RETURN id(source) AS source, id(target) AS target, type(r) AS type, properties(r) AS props
        """
        raw_nodes = self.client.query(cypher_nodes)
        raw_edges = self.client.query(cypher_edges)

        nodes = []
        for n in raw_nodes:
            nodes.append({
                "data": {
                    "id": str(n["id"]),
                    "label": n["name"],
                    "group": n["label"],
                    "properties": n.get("props", {})
                }
            })

        edges = []
        for e in raw_edges:
            edges.append({
                "data": {
                    "source": str(e["source"]),
                    "target": str(e["target"]),
                    "label": e["type"],
                    "properties": e.get("props", {})
                }
            })

        return {"nodes": nodes, "edges": edges}


# Global singleton instance
topology_agent = TopologyAgent()

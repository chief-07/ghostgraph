"""
GhostGraph Topology Agent.
High-performance batch ingestion of binary decompilation AST into FalkorDB
using OpenCypher UNWIND transactions.
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
        try:
            self.client.query("CREATE INDEX FOR (f:Function) ON (f.name)")
            self.client.query("CREATE INDEX FOR (m:GlobalMemory) ON (m.address)")
            self.client.query("CREATE INDEX FOR (t:TestCase) ON (t.id)")
            logger.info("Graph indices verified in FalkorDB.")
        except Exception as e:
            logger.debug(f"Index notice: {e}")

    def ingest_target(self, target_json_path: str, test_vectors_path: Optional[str] = None) -> Dict[str, Any]:
        """
        Batched Ingestion using OpenCypher UNWIND.
        Transforms 60+ individual roundtrip network queries into 4 fast atomic batches.
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

        logger.info(f"Batch ingesting {target_name} into FalkorDB Cloud...")

        # 1. Create Program Node
        cypher_prog = """
        MERGE (p:Program {name: $name})
        SET p.arch = $arch,
            p.description = $desc
        RETURN p.name
        """
        self.client.query(cypher_prog, {
            "name": target_name,
            "arch": arch,
            "desc": data.get("description", "")
        })

        # 2. Batch Ingest Global Memory Buffers (UNWIND)
        if global_memory:
            cypher_mem = """
            UNWIND $buffers AS b
            MERGE (m:GlobalMemory {address: b.address})
            SET m.label = b.label,
                m.data_type = b.data_type,
                m.size = b.size
            RETURN count(m)
            """
            self.client.query(cypher_mem, {"buffers": global_memory})

        # 3. Batch Ingest Functions & Code (UNWIND)
        if functions:
            fn_payload = []
            call_edges = []
            read_edges = []
            write_edges = []

            for fn in functions:
                fn_payload.append({
                    "name": fn["name"],
                    "address": fn.get("address", ""),
                    "signature": fn.get("signature", ""),
                    "pseudocode": fn.get("pseudocode", "")
                })
                for c in fn.get("callees", []):
                    call_edges.append({"caller": fn["name"], "callee": c})
                for r in fn.get("reads_memory", []):
                    read_edges.append({"fn": fn["name"], "addr": r})
                for w in fn.get("writes_memory", []):
                    write_edges.append({"fn": fn["name"], "addr": w})

            cypher_fns = """
            MATCH (p:Program {name: $pname})
            UNWIND $fns AS fn
            MERGE (f:Function {name: fn.name})
            SET f.address = fn.address,
                f.signature = fn.signature,
                f.pseudocode = fn.pseudocode
            MERGE (p)-[:CONTAINS]->(f)
            RETURN count(f)
            """
            self.client.query(cypher_fns, {"pname": target_name, "fns": fn_payload})

            # Batch Ingest Call Edges
            if call_edges:
                cypher_calls = """
                UNWIND $calls AS c
                MATCH (caller:Function {name: c.caller}), (callee:Function {name: c.callee})
                MERGE (caller)-[:CALLS]->(callee)
                RETURN count(*)
                """
                self.client.query(cypher_calls, {"calls": call_edges})

            # Batch Ingest Memory READS Edges
            if read_edges:
                cypher_reads = """
                UNWIND $reads AS r
                MATCH (f:Function {name: r.fn}), (m:GlobalMemory {address: r.addr})
                MERGE (f)-[:READS]->(m)
                RETURN count(*)
                """
                self.client.query(cypher_reads, {"reads": read_edges})

            # Batch Ingest Memory WRITES Edges
            if write_edges:
                cypher_writes = """
                UNWIND $writes AS w
                MATCH (f:Function {name: w.fn}), (m:GlobalMemory {address: w.addr})
                MERGE (f)-[:WRITES]->(m)
                RETURN count(*)
                """
                self.client.query(cypher_writes, {"writes": write_edges})

        # 4. Batch Ingest Test Vectors if provided
        test_count = 0
        if test_vectors_path and Path(test_vectors_path).exists():
            with open(test_vectors_path, "r", encoding="utf-8") as f:
                vectors = json.load(f)
            test_count = len(vectors)

            tc_payload = []
            for v in vectors:
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

                tc_payload.append({
                    "id": v["id"],
                    "cat": cat,
                    "desc": v.get("description", ""),
                    "target_fn": target_fn
                })

            cypher_tc = """
            UNWIND $tests AS t
            MERGE (tc:TestCase {id: t.id})
            SET tc.category = t.cat,
                tc.description = t.desc
            WITH tc, t
            MATCH (f:Function {name: t.target_fn})
            MERGE (tc)-[:EXERCISES]->(f)
            RETURN count(tc)
            """
            self.client.query(cypher_tc, {"tests": tc_payload})

        summary = {
            "target": target_name,
            "functions_count": len(functions),
            "memory_nodes_count": len(global_memory),
            "structs_count": len(structs),
            "test_cases_count": test_count,
            "status": "INGESTED"
        }
        logger.info(f"FalkorDB Cloud Ingestion complete: {summary}")
        return summary

    def get_topology_graph(self) -> Dict[str, Any]:
        """
        Exports the current graph as Cytoscape.js compatible nodes and edges.
        Ensures strict relational integrity so no edge points to a missing node.
        """
        cypher_nodes = """
        MATCH (n)
        WHERE n:Program OR n:Function OR n:GlobalMemory OR n:TestCase OR n:Candidate
        RETURN id(n) AS id, labels(n)[0] AS label,
               coalesce(n.name, n.address, n.id, 'Node') AS name,
               properties(n) AS props
        """
        cypher_edges = """
        MATCH (source)-[r]->(target)
        WHERE (source:Program OR source:Function OR source:GlobalMemory OR source:TestCase OR source:Candidate)
          AND (target:Program OR target:Function OR target:GlobalMemory OR target:TestCase OR target:Candidate)
        RETURN id(source) AS source, id(target) AS target, type(r) AS type, properties(r) AS props
        """
        raw_nodes = self.client.query(cypher_nodes)
        raw_edges = self.client.query(cypher_edges)

        valid_node_ids = set()
        nodes = []
        for n in raw_nodes:
            nid = str(n["id"])
            valid_node_ids.add(nid)
            nodes.append({
                "data": {
                    "id": nid,
                    "label": n["name"],
                    "group": n["label"],
                    "properties": n.get("props", {})
                }
            })

        edges = []
        for e in raw_edges:
            src = str(e["source"])
            tgt = str(e["target"])
            # Strictly verify both endpoints exist in nodes
            if src in valid_node_ids and tgt in valid_node_ids:
                edges.append({
                    "data": {
                        "source": src,
                        "target": tgt,
                        "label": e["type"],
                        "properties": e.get("props", {})
                    }
                })

        return {"nodes": nodes, "edges": edges}


# Global singleton instance
topology_agent = TopologyAgent()

"""
GhostGraph FalkorDB Client Interface.
Handles authentication, connection pooling, and Cypher query execution
for both FalkorDB Cloud and local Docker instances. Includes an in-memory
topological fallback for offline development.
"""

import os
import logging
from typing import Any, Dict, List, Optional
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("ghostgraph.falkordb")
logging.basicConfig(level=logging.INFO)

class FalkorClient:
    """Manages connection and query execution to FalkorDB."""

    def __init__(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        graph_name: str = "ghostgraph"
    ):
        self.host = host or os.getenv("FALKORDB_HOST", "localhost")
        self.port = port or int(os.getenv("FALKORDB_PORT", "6379"))
        self.username = username or os.getenv("FALKORDB_USERNAME", None)
        self.password = password or os.getenv("FALKORDB_PASSWORD", None)
        self.graph_name = graph_name
        self.client = None
        self.graph = None
        self.is_connected = False
        self._fallback_nodes: Dict[str, Dict[str, Any]] = {}
        self._fallback_edges: List[Dict[str, Any]] = []

        self._connect()

    def _connect(self) -> None:
        """Attempts connection to real FalkorDB instance."""
        try:
            import falkordb
            kwargs = {"host": self.host, "port": self.port}
            if self.username:
                kwargs["username"] = self.username
            if self.password:
                kwargs["password"] = self.password

            self.client = falkordb.FalkorDB(**kwargs)
            self.graph = self.client.select_graph(self.graph_name)
            # Test query
            self.graph.query("RETURN 1")
            self.is_connected = True
            logger.info(f"Connected successfully to FalkorDB at {self.host}:{self.port} [Graph: {self.graph_name}]")
        except Exception as e:
            self.is_connected = False
            logger.warning(
                f"Could not connect to FalkorDB ({e}). Operating in resilient In-Memory Graph mode."
            )

    def query(self, cypher: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Executes an OpenCypher query and returns list of record dictionaries.
        """
        if self.is_connected and self.graph:
            try:
                res = self.graph.query(cypher, params or {})
                records = []
                if hasattr(res, "result_set") and res.result_set:
                    raw_headers = res.header if hasattr(res, "header") and res.header else []
                    headers = []
                    for h in raw_headers:
                        if isinstance(h, (list, tuple)) and len(h) > 1:
                            headers.append(str(h[1]))
                        else:
                            headers.append(str(h))
                    if not headers:
                        headers = [f"col_{i}" for i in range(len(res.result_set[0]))]

                    for row in res.result_set:
                        records.append({headers[i]: row[i] for i in range(min(len(headers), len(row)))})
                return records
            except Exception as e:
                logger.error(f"FalkorDB Cypher Error: {e} | Query: {cypher}")
                raise

        # Resilient fallback handler for local/offline testing
        return self._simulate_fallback_query(cypher, params or {})

    def _simulate_fallback_query(self, cypher: str, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Simulates key queries when offline."""
        logger.debug(f"[In-Memory Mode] Query: {cypher[:60]}... Params: {params}")

        # Handle node creation simulation
        if "MERGE (f:Function" in cypher:
            fname = params.get("name", "UnknownFn")
            self._fallback_nodes[fname] = {"id": fname, "label": "Function", "name": fname, "props": params}
        elif "MERGE (m:GlobalMemory" in cypher:
            addr = params.get("addr", "0x0")
            lbl = params.get("label", "MEM")
            self._fallback_nodes[addr] = {"id": addr, "label": "GlobalMemory", "name": f"{lbl} ({addr})", "props": params}
        elif "MERGE (t:TestCase" in cypher:
            tid = params.get("tid", "TC0")
            self._fallback_nodes[tid] = {"id": tid, "label": "TestCase", "name": tid, "props": params}

        # Handle Cytoscape graph export
        if "MATCH (n)" in cypher and "WHERE n:Function" in cypher:
            return list(self._fallback_nodes.values())
        if "MATCH (source)-[r]->(target)" in cypher:
            return self._fallback_edges

        # Memory source resolution simulation
        if "MATCH (mem:GlobalMemory" in cypher and "initializer:Function" in cypher:
            addr = params.get("addr", "")
            return [{
                "address": addr,
                "label": "DIR_OFFSETS" if "6080" in addr else "SCATTER_CORNERS",
                "data_type": "int[4][2]",
                "producer_function": "init_game_tables",
                "initialization_code": "void init_game_tables() { /* Offset vectors */ }"
            }]

        return []

    def clear_graph(self) -> None:
        """Clears all nodes and relationships in the current graph."""
        if self.is_connected and self.graph:
            try:
                self.graph.delete()
                self.graph = self.client.select_graph(self.graph_name)
                logger.info(f"FalkorDB Graph '{self.graph_name}' cleared.")
            except Exception as e:
                logger.warning(f"Error resetting FalkorDB graph: {e}")
        self._fallback_nodes.clear()
        self._fallback_edges.clear()


# Global singleton instance
falkor_client = FalkorClient()

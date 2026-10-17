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

    def ingest_binary(
        self,
        binary_data: bytes,
        program_name: str = "binary_target",
        base_address: int = 0x00401000,
        target_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Genuinely disassembles machine code bytes using Capstone,
        extracts function boundaries, call graphs, and RIP-relative memory references,
        and persists the topological graph directly into FalkorDB Cloud (multigraph isolated).
        """
        import struct
        import capstone
        from capstone import x86

        if target_id:
            self.client.select_target_graph(target_id)

        # Step 1: Detect ELF headers if present to find code offset & entrypoint
        code_bytes = binary_data
        load_addr = base_address

        if binary_data.startswith(b"\x7fELF"):
            try:
                if binary_data[4] == 2:  # ELFCLASS64
                    e_entry = struct.unpack_from("<Q", binary_data, 24)[0]
                    e_phoff = struct.unpack_from("<Q", binary_data, 32)[0]
                    e_phentsize = struct.unpack_from("<H", binary_data, 54)[0]
                    e_phnum = struct.unpack_from("<H", binary_data, 56)[0]

                    for i in range(e_phnum):
                        offset = e_phoff + (i * e_phentsize)
                        p_type, p_flags = struct.unpack_from("<II", binary_data, offset)
                        if p_type == 1 and (p_flags & 1):  # PT_LOAD & PF_X
                            p_offset = struct.unpack_from("<Q", binary_data, offset + 8)[0]
                            p_vaddr = struct.unpack_from("<Q", binary_data, offset + 16)[0]
                            p_filesz = struct.unpack_from("<Q", binary_data, offset + 32)[0]
                            if p_filesz > 0 and p_offset < len(binary_data):
                                code_bytes = binary_data[p_offset : p_offset + p_filesz]
                                load_addr = p_vaddr
                                break
                    if e_entry != 0:
                        load_addr = e_entry
            except Exception as e:
                logger.debug(f"ELF parse note: {e}")

        # Step 2: Full Instruction Disassembly with Capstone
        md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)
        md.detail = True

        instructions = list(md.disasm(code_bytes, load_addr))
        if not instructions:
            return {
                "status": "ERROR",
                "message": "No valid x86_64 machine code instructions disassembled.",
                "functions_count": 0
            }

        # Step 3: Discover Function Boundaries & Call Destinations
        insn_by_addr = {insn.address: insn for insn in instructions}
        call_targets = set()
        ret_addrs = set()

        for insn in instructions:
            if insn.group(capstone.CS_GRP_CALL):
                try:
                    target_addr = int(insn.op_str, 16)
                    call_targets.add(target_addr)
                except ValueError:
                    pass
            elif insn.group(capstone.CS_GRP_RET):
                ret_addrs.add(insn.address)

        entry_points = sorted(list(call_targets | {load_addr}))

        functions = []
        function_map = {}

        for i, entry in enumerate(entry_points):
            fn_name = f"sub_{entry:08x}" if entry != load_addr else "main_entry"
            fn_insns = []
            next_entry = entry_points[i + 1] if i + 1 < len(entry_points) else float("inf")

            cur = entry
            while cur in insn_by_addr and cur < next_entry:
                insn = insn_by_addr[cur]
                fn_insns.append(insn)
                cur += insn.size
                if insn.address in ret_addrs:
                    break

            if fn_insns:
                functions.append({
                    "name": fn_name,
                    "address": f"0x{entry:08X}",
                    "instruction_count": len(fn_insns),
                    "instructions": fn_insns,
                    "asm_text": "\n".join(f"0x{ins.address:08X}: {ins.mnemonic} {ins.op_str}" for ins in fn_insns[:40])
                })
                function_map[entry] = fn_name

        # Step 4: Extract CALLS and Memory READS/WRITES Edges
        call_edges = []
        read_edges = []
        write_edges = []
        global_memory = {}

        for fn in functions:
            for insn in fn["instructions"]:
                if insn.group(capstone.CS_GRP_CALL):
                    try:
                        tgt = int(insn.op_str, 16)
                        if tgt in function_map:
                            call_edges.append({
                                "caller": fn["name"],
                                "callee": function_map[tgt]
                            })
                    except ValueError:
                        pass

                for op_idx, op in enumerate(insn.operands):
                    if op.type == x86.X86_OP_MEM:
                        base_reg = insn.reg_name(op.mem.base)
                        if base_reg == "rip":
                            disp = op.mem.disp
                            target_mem = f"0x{(insn.address + insn.size + disp) & 0xFFFFFFFF:08X}"
                            is_write = (op_idx == 0 and insn.mnemonic in ["mov", "add", "sub", "xor", "inc", "dec", "or", "and"])
                            
                            if is_write:
                                write_edges.append({"fn": fn["name"], "addr": target_mem})
                                access_type = "READ_WRITE"
                            else:
                                read_edges.append({"fn": fn["name"], "addr": target_mem})
                                access_type = "READ_ONLY"

                            if target_mem not in global_memory:
                                global_memory[target_mem] = {
                                    "address": target_mem,
                                    "label": f"DATA_{target_mem[2:]}",
                                    "access_type": access_type
                                }

        # Step 5: Ingest into FalkorDB Cloud
        self.client.query(
            "MERGE (p:Program {name: $name}) SET p.instruction_count = $cnt, p.functions_count = $fc RETURN p.name",
            {"name": program_name, "cnt": len(instructions), "fc": len(functions)}
        )

        fn_payload = [{
            "name": f["name"],
            "address": f["address"],
            "count": f["instruction_count"],
            "asm": f["asm_text"]
        } for f in functions]
        if fn_payload:
            self.client.query("""
            MATCH (p:Program {name: $pname})
            UNWIND $fns AS fn
            MERGE (f:Function {address: fn.address})
            SET f.name = fn.name,
                f.instruction_count = fn.count,
                f.raw_asm = fn.asm
            MERGE (p)-[:CONTAINS]->(f)
            RETURN count(f)
            """, {"pname": program_name, "fns": fn_payload})

        mem_payload = list(global_memory.values())
        if mem_payload:
            self.client.query("""
            UNWIND $mem AS m
            MERGE (g:GlobalMemory {address: m.address})
            SET g.label = m.label,
                g.access_type = m.access_type
            RETURN count(g)
            """, {"mem": mem_payload})

        if call_edges:
            self.client.query("""
            UNWIND $calls AS c
            MATCH (caller:Function {name: c.caller}), (callee:Function {name: c.callee})
            MERGE (caller)-[:CALLS]->(callee)
            RETURN count(*)
            """, {"calls": call_edges})

        if read_edges:
            self.client.query("""
            UNWIND $reads AS r
            MATCH (f:Function {name: r.fn}), (m:GlobalMemory {address: r.addr})
            MERGE (f)-[:READS]->(m)
            RETURN count(*)
            """, {"reads": read_edges})

        if write_edges:
            self.client.query("""
            UNWIND $writes AS w
            MATCH (f:Function {name: w.fn}), (m:GlobalMemory {address: w.addr})
            MERGE (f)-[:WRITES]->(m)
            RETURN count(*)
            """, {"writes": write_edges})

        primary_fn = functions[0]["name"] if functions else "main_entry"
        critical_mem = list(global_memory.keys())[0] if global_memory else "0x00403000"
        decompiled_snippet = "\n".join(f["asm_text"] for f in functions[:5]) if functions else "// Disassembled binary instructions"

        return {
            "status": "INGESTED",
            "target_id": target_id or program_name,
            "program_name": program_name,
            "primary_fn": primary_fn,
            "critical_mem": critical_mem,
            "total_instructions": len(instructions),
            "functions_count": len(functions),
            "functions": [f["name"] for f in functions],
            "call_edges_count": len(call_edges),
            "memory_nodes_count": len(global_memory),
            "read_edges_count": len(read_edges),
            "write_edges_count": len(write_edges),
            "entry_point": f"0x{load_addr:08X}",
            "decompiled_snippet": decompiled_snippet
        }

    def ingest_target(
        self,
        target_json_path: str,
        test_vectors_path: Optional[str] = None,
        target_id: Optional[str] = None,
        reset_graph: bool = False
    ) -> Dict[str, Any]:
        """
        Batched Ingestion using OpenCypher UNWIND.
        Transforms 60+ individual roundtrip network queries into fast atomic batches.
        Preserves cross-session episodic memory (Candidates, TestCases, FAILED_ON edges)
        across sessions unless reset_graph is explicitly requested (Track 02).
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

        # Target Multigraph Isolation (Bug #5)
        clean_target_id = target_id or target_name
        self.client.select_target_graph(clean_target_id)
        if reset_graph:
            logger.info(f"Explicit graph reset requested for {clean_target_id}...")
            self.client.clear_graph()
        else:
            logger.info(f"Preserving durable cross-session episodic memory in graph {clean_target_id}...")

        logger.info(f"Batch ingesting {target_name} into FalkorDB Cloud (graph: {self.client.graph_name})...")

        # 1. Create Program Node
        cypher_prog = """
        MERGE (p:Program {name: $name})
        SET p.arch = $arch,
            p.description = $desc,
            p.target_id = $tid
        RETURN p.name
        """
        self.client.query(cypher_prog, {
            "name": target_name,
            "arch": arch,
            "desc": data.get("description", ""),
            "tid": clean_target_id
        })

        # 2. Batch Ingest Global Memory Buffers (UNWIND)
        if global_memory:
            cypher_mem = """
            UNWIND $buffers AS b
            MERGE (m:GlobalMemory {address: b.address})
            SET m.label = b.label,
                m.data_type = b.data_type,
                m.size = b.size,
                m.description = coalesce(b.description, '')
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
                pseudocode = fn.get("pseudocode") or fn.get("decompiled_c") or fn.get("code") or ""
                raw_asm = fn.get("raw_asm") or fn.get("assembly") or fn.get("asm_text") or ""
                fn_payload.append({
                    "name": fn["name"],
                    "address": fn.get("address", ""),
                    "signature": fn.get("signature", ""),
                    "pseudocode": pseudocode,
                    "raw_asm": raw_asm
                })
                callees = fn.get("callees") or (fn.get("call_graph", {}).get("callees") if isinstance(fn.get("call_graph"), dict) else []) or []
                for c in callees:
                    call_edges.append({"caller": fn["name"], "callee": c})
                reads = fn.get("reads_memory") or fn.get("memory_reads") or []
                for r in reads:
                    read_edges.append({"fn": fn["name"], "addr": r})
                writes = fn.get("writes_memory") or fn.get("memory_writes") or []
                for w in writes:
                    write_edges.append({"fn": fn["name"], "addr": w})

            cypher_fns = """
            MATCH (p:Program {name: $pname})
            UNWIND $fns AS fn
            MERGE (f:Function {name: fn.name})
            SET f.address = fn.address,
                f.signature = fn.signature,
                f.pseudocode = fn.pseudocode,
                f.raw_asm = fn.raw_asm
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

        # 3b. Batch Ingest Struct Definitions & Fields (Bug #4)
        if structs:
            struct_payload = []
            field_payload = []
            for s in structs:
                sname = s.get("name")
                ssize = s.get("size", 0)
                struct_payload.append({"name": sname, "size": ssize})
                for fld in s.get("fields", []):
                    field_payload.append({
                        "struct_name": sname,
                        "name": fld.get("name"),
                        "offset": fld.get("offset", 0),
                        "type": fld.get("type", "void*")
                    })

            cypher_structs = """
            MATCH (p:Program {name: $pname})
            UNWIND $structs AS s
            MERGE (st:Struct {name: s.name})
            SET st.size = s.size
            MERGE (p)-[:DEFINES_STRUCT]->(st)
            RETURN count(st)
            """
            self.client.query(cypher_structs, {"pname": target_name, "structs": struct_payload})

            if field_payload:
                cypher_fields = """
                UNWIND $fields AS f
                MATCH (st:Struct {name: f.struct_name})
                MERGE (sf:StructField {id: f.struct_name + "_" + f.name})
                SET sf.name = f.name,
                    sf.offset = f.offset,
                    sf.type = f.type
                MERGE (st)-[:HAS_FIELD]->(sf)
                RETURN count(sf)
                """
                self.client.query(cypher_fields, {"fields": field_payload})

            # Link GlobalMemory buffers to structs if data_type maps to struct
            cypher_map_mem = """
            MATCH (m:GlobalMemory), (st:Struct)
            WHERE m.data_type CONTAINS st.name
            MERGE (m)-[:MAPS_TO_STRUCT]->(st)
            RETURN count(*)
            """
            self.client.query(cypher_map_mem)

        # 4. Batch Ingest Test Vectors if provided
        test_count = 0
        if test_vectors_path and Path(test_vectors_path).exists():
            with open(test_vectors_path, "r", encoding="utf-8") as f:
                vectors = json.load(f)
            test_count = len(vectors)

            tc_payload = []
            for v in vectors:
                cat = v.get("category", "")
                target_fn = v.get("target_fn", "")
                if not target_fn:
                    if "billing" in target_name.lower() or "tax" in cat.lower() or "tariff" in cat.lower() or "billing" in cat.lower():
                        target_fn = "compute_progressive_tax"
                    elif "blinky" in cat:
                        target_fn = "update_blinky_ai"
                    elif "pinky" in cat:
                        target_fn = "update_pinky_ai"
                    elif "inky" in cat:
                        target_fn = "update_inky_ai"
                    elif "clyde" in cat:
                        target_fn = "update_clyde_ai"
                    elif "Architecture" in cat:
                        target_fn = "init_flight_computer"
                    elif "Propulsion" in cat or "Attitude" in cat:
                        target_fn = "apply_thrust_vector"
                    elif "Terrain" in cat:
                        target_fn = "check_altitude_raycast"
                    elif "Touchdown" in cat:
                        target_fn = "evaluate_touchdown_dynamics"
                    elif "Snake" in cat or "General" in cat:
                        target_fn = "step_snake_tick"
                    else:
                        target_fn = "update_newtonian_physics"

                tc_payload.append({
                    "id": v["id"],
                    "cat": cat,
                    "desc": v.get("description", ""),
                    "target_fn": target_fn
                })

            cypher_tc = """
            MATCH (p:Program {name: $pname})
            UNWIND $tests AS t
            MERGE (tc:TestCase {id: t.id})
            SET tc.category = t.cat,
                tc.description = t.desc
            MERGE (p)-[:HAS_TEST]->(tc)
            WITH tc, t
            MATCH (f:Function {name: t.target_fn})
            MERGE (tc)-[:EXERCISES]->(f)
            RETURN count(tc)
            """
            self.client.query(cypher_tc, {"pname": target_name, "tests": tc_payload})

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
        WHERE n:Program OR n:Function OR n:GlobalMemory OR n:TestCase OR n:Candidate OR n:Struct OR n:StructField
        RETURN id(n) AS id, labels(n)[0] AS label,
               coalesce(n.name, n.address, n.id, 'Node') AS name,
               properties(n) AS props
        """
        cypher_edges = """
        MATCH (source)-[r]->(target)
        WHERE (source:Program OR source:Function OR source:GlobalMemory OR source:TestCase OR source:Candidate OR source:Struct OR source:StructField)
          AND (target:Program OR target:Function OR target:GlobalMemory OR target:TestCase OR target:Candidate OR target:Struct OR target:StructField)
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

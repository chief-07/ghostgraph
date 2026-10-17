# 👻 GhostGraph: Autonomous Graph-Guided Binary Reconstruction & Self-Healing Swarm

[![FalkorDB Cloud](https://img.shields.io/badge/Graph_Database-FalkorDB_Cloud-8B5CF6?style=for-the-badge&logo=redis&logoColor=white)](https://falkordb.com/)
[![OpenCypher](https://img.shields.io/badge/Query_Language-OpenCypher-009688?style=for-the-badge)](https://opencypher.org/)
[![Model Context Protocol](https://img.shields.io/badge/Protocol-MCP-EA580C?style=for-the-badge)](https://modelcontextprotocol.io/)
[![Google Gemini](https://img.shields.io/badge/LLM-Gemini_Flash--Lite-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://aistudio.google.com/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-059669?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-F59E0B?style=for-the-badge)](https://opensource.org/licenses/MIT)

> **Built for the WeMakeDevs & FalkorDB Hackathon ("Graph Hacks: Context for AI Agents")**  
> **Official Track Declarations (Rule #5 & #10):**  
> 🕵️ **Primary:** **Track 01 — *Agents That Act on Connected Data*** (Prize: iPhone 18 Pro)  
> 🤖 **Co-Primary (Dual Entry):** **Track 02 — *Agent Memory and Coordination*** (Prize: PlayStation 5 + GTA VI)

---

## 🏛️ Executive Summary: Why GhostGraph Was Built

Across defense networks, aerospace telemetry cores, global financial clearinghouses, and classic gaming architectures, hundreds of billions of dollars in critical infrastructure run on **compiled machine binaries (`.exe`, ELF, firmware ROMs) whose original source code has been permanently lost**, whose original authors retired decades ago, and whose build environments are dead.

When reverse engineers pass these stripped binaries into decompilers (NSA Ghidra, IDA Pro), they do not receive clean source code. They receive **fragmented, uncompilable C pseudocode** riddled with detached raw memory offsets (`DAT_00405000`), ungrounded call chains, and missing struct layouts.

```
                              THE "CONTEXT CLIFF"
   ┌────────────────────────────────────────────────────────────────────────┐
   │ double compute_progressive_tax(double amount) {                        │
   │     double *brackets = (double *)0x00405000; // <-- WHAT IS THIS?      │
   │     ...                                                                │
   │ }                                                                      │
   └───────────────────────────────────┬────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┴──────────────────────────────┐
        ▼                                                             ▼
┌───────────────────────────────┐             ┌───────────────────────────────┐
│     FLAT FRONTIER LLM         │             │          GHOSTGRAPH           │
│     (Isolated Prompt)         │             │      (FalkorDB Cloud)         │
├───────────────────────────────┤             ├───────────────────────────────┤
│ Blind to offset 0x00405000    │             │ 2-hop OpenCypher traversal    │
│ Hallucinates dummy flat rate  │             │ identifies init_tariff_tables │
│ Parity: 35.0% (BROKEN)        │             │ Parity: 100.0% (VERIFIED)     │
└───────────────────────────────┘             └───────────────────────────────┘
```

When prompted with these isolated functions, **frontier LLMs hallucinate and fail** because they suffer from the **Context Cliff**: an LLM reading subroutine `A` cannot see that memory buffer `0x00405000` was initialized 2 hops away in subroutine `B` with progressive tax brackets, nor that subroutine `C` enforces caller invariants.

**GhostGraph** solves this crisis by transforming decompiled binary topology into an active, queryable knowledge graph on **FalkorDB Cloud**. An autonomous multi-agent swarm operates over FalkorDB via Model Context Protocol (MCP) Cypher tools, resolves detached memory pointers, computes subroutine PageRank, reconstructs human-readable modern source code, and **differentially verifies mathematical parity byte-for-byte** until achieving 100.0% test convergence.

---

## 🏆 The "Rule #3" Benchmark: FalkorDB is Load-Bearing, Not Decorative

In the official *Graph Hacks* rules, WeMakeDevs and FalkorDB established the **Golden Rule (Rule #3)**:
> *"The graph has to do real work. A visualization drawn on top of ordinary storage does not qualify: if the product still works once FalkorDB is taken out, the graph is decoration rather than the thing the product runs on."*

GhostGraph does not merely store logs or draw passive nodes in FalkorDB. **If you disconnect FalkorDB, GhostGraph's code reconstruction engine mathematically collapses:**

| Evaluation Dimension | Mode A: Flat LLM (No Graph / Isolated) | Mode B: GhostGraph (FalkorDB Cloud Swarm) | Why FalkorDB is Irreplaceable |
| :--- | :---: | :---: | :--- |
| **Context Strategy** | Raw isolated Ghidra pseudocode | 2-hop caller topology + global memory provenance | Resolves multi-hop dependencies across call boundaries |
| **Detached Memory (`0x00405000`)** | Hallucinates flat 10% rate or zero buffer | Resolves exact progressive brackets `(100, 0%), (500, 5%), (2000, 12%)` from `init_tariff_tables` | Graph traversal links producer subroutines to consumer offsets |
| **Apollo Gravity & Thrust Tables** | Guesses earth gravity $9.81\text{ m/s}^2$ | Extracts true lunar constant $g=1.62\text{ m/s}^2$ & dry mass ratios from `0x00403000` | Reconstructed physics accurately land the Lunar Module |
| **Space Invaders Missile Grid** | Missing bunker grid & player state | Binds `ALIEN_MISSILE_STATE` (0x00405400) & `BUNKER_EROSION_GRID` (0x00405500) | Full game loop runs with authentic 1978 collision physics |
| **Episodic Failure Memory** | Repeats identical compile errors in loop | Reads `(:Candidate)-[:FAILED_ON]->(:TestCase)` to correct edge cases | Agents self-heal based on past error telemetry |
| **Differential Test Parity** | **35.0% – 40.0% (FAIL)** | **100.0% (20/20 PASS)** | **Mathematical proof that the graph produces the solution** |

---

## 🎯 Official Hackathon Track Alignment

### 🕵️ Track 01: Agents That Act on Connected Data (Primary Entry)
GhostGraph is the archetype of Track 01 because compiled binaries are pure connected topologies (Call Graphs, Dataflow Graphs, Memory Maps):
- **Multi-Hop Reasoning:** When reconstructing `compute_progressive_tax`, GhostGraph traverses `(consumer:Function)-[:READS]->(mem:GlobalMemory)<-[:WRITES]-(producer:Function)` across 2 hops to discover data definitions that do not exist anywhere in the consumer function's code.
- **Graph Queries & Algorithms as Agent Tools:** The Reconstruction Agent does not receive static text context. It dynamically calls FalkorDB tools:
  - `get_function_context`: Gathers caller, callee, read, and write sets.
  - `resolve_memory_source`: Traces backwards from memory hex offsets to producer initialization routines.
  - `compute_function_pagerank`: Uses native FalkorDB `algo.pageRank` to find critical architectural hubs.
  - `find_shortest_call_path`: Uses FalkorDB OpenCypher `shortestPath` to map call sequences between interacting subroutines.
- **Tool Selection via Model Context Protocol (MCP):** All Cypher graph actions are exposed as standards-compliant MCP tools in `backend/mcp_tools/`.
- **Explainable Decisions & Audit Trails:** Every synthesized candidate exports a signed verification certificate containing the complete OpenCypher path sequence that justified its types, memory bindings, and constants.

### 🤖 Track 02: Agent Memory and Coordination (Co-Primary Dual Entry)
GhostGraph deploys a multi-agent swarm that coordinates through FalkorDB as shared working memory:
- **Specialized 4-Agent Swarm:**
  1. **Topology Agent:** Disassembles binaries via Capstone and ingests call edges, memory buffers, and struct layouts into FalkorDB.
  2. **Reconstruction Agent:** Navigates FalkorDB via MCP tools to assemble prompt context and synthesize clean source candidates.
  3. **Verification Agent:** Executes compiled candidates against deterministic test vectors and measures exact numerical parity.
  4. **Supervisor Agent:** Orchestrates handoffs, monitors parity convergence, and drives the self-healing repair loop.
- **Episodic Failure Memory:** When a candidate fails a test vector, the failure diff is written directly into FalkorDB:
  ```cypher
  MERGE (c:Candidate {id: $cid})
  MERGE (t:TestCase {id: $tid})
  CREATE (c)-[:FAILED_ON {diff: $diff, timestamp: timestamp()}]->(t)
  ```
  On the subsequent iteration, the agent queries FalkorDB via `fetch_failure_memory` so it **never repeats the same algorithmic mistake**.
- **Multigraph Isolation (Hackathon Blueprint Feature 3):** Uses FalkorDB's multigraph engine (`falkor_client.select_target_graph()`) to isolate distinct targets into individual subgraphs (`ghostgraph_billing`, `ghostgraph_space_invaders`, `ghostgraph_lunar_lander`) on a single database cluster.
- **High-Performance Read-Only Queries:** Utilizes `graph.ro_query()` for concurrent agent reads with sub-5ms query latency and transparent execution tracing.

---

## 🕹️ The 3 Curated Flagship Showcases

GhostGraph includes 3 live, end-to-end benchmark targets spanning business systems, aerospace guidance, and classic gaming:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   GHOSTGRAPH SHOWCASE TARGETS                                   │
├───────────────────────────────┬─────────────────────────────────┬───────────────────────────────┤
│ 1. 1978 Space Invaders Arcade │ 2. Apollo 11 Lunar Lander (LGC) │ 3. Enterprise Billing Engine  │
├───────────────────────────────┼─────────────────────────────────┼───────────────────────────────┤
│ • Authentic C core (Dettus)   │ • 1969 Apollo Guidance Computer │ • Progressive marginal taxes  │
│ • Subroutines: aliensMissile- │ • Coupled Newtonian mechanics   │ • Banker's rounding algorithm │
│   Move, doScoring, aliensReset│ • Lunar gravity: g = 1.62 m/s²  │ • Brackets: 0%, 5%, 12%, 20%  │
│ • Detached: ALIEN_BLOCK_GRID  │ • Detached: 0x00403000 (thrust) │ • Detached: 0x00405000 (tax)  │
│   and ALIEN_MISSILE_STATE     │ • Detached: 0x00403100 (terrain)│ • Without Graph: 35.0% parity │
│ • Without Graph: Broken array │ • Without Graph: 40.0% parity   │ • GhostGraph: 100.0% parity   │
│ • GhostGraph: 100.0% parity   │ • GhostGraph: 100.0% parity     │ • 20/20 Invoices Verified     │
└───────────────────────────────┴─────────────────────────────────┴───────────────────────────────┘
```

Plus a **Live Custom Binary Upload Engine** powered by the **Capstone Disassembler**, allowing users to upload any raw stripped ELF/PE binary and watch FalkorDB index its call topology and memory dereferences in <120ms.

---

## 📐 FalkorDB Graph Schema

```mermaid
erDiagram
    Program ||--o{ Function : CONTAINS
    Function ||--o{ Function : CALLS
    Function ||--o{ GlobalMemory : READS
    Function ||--o{ GlobalMemory : WRITES
    Struct ||--o{ StructField : HAS_FIELD
    GlobalMemory ||--o| Struct : INSTANTIATES
    TestCase ||--o{ Function : EXERCISES
    Candidate ||--o{ Function : RECONSTRUCTS
    Candidate ||--o{ TestCase : PASSED
    Candidate ||--o{ TestCase : FAILED_ON
```

### Node Schema:
- `(:Program {name, arch, sha256, target_type})`
- `(:Function {name, address, signature, pseudocode, raw_asm})`
- `(:GlobalMemory {address, label, data_type, size, description})`
- `(:Struct {name, size})`
- `(:StructField {name, offset, type})`
- `(:TestCase {id, description, input_payload, expected_output})`
- `(:Candidate {id, function_name, target_name, source_code, version, status, timestamp})`

### Relationship Schema:
- `(:Program)-[:CONTAINS]->(:Function)`
- `(:Function)-[:CALLS]->(:Function)`
- `(:Function)-[:READS]->(:GlobalMemory)`
- `(:Function)-[:WRITES]->(:GlobalMemory)`
- `(:Struct)-[:HAS_FIELD]->(:StructField)`
- `(:Candidate)-[:RECONSTRUCTS]->(:Function)`
- `(:Candidate)-[:PASSED]->(:TestCase)`
- `(:Candidate)-[:FAILED_ON {diff, timestamp}]->(:TestCase)`
- `(:TestCase)-[:EXERCISES]->(:Function)`

---

## ⚡ Core OpenCypher Queries & Graph Algorithms

### 1. Multi-Hop Memory Provenance Resolver (Track 01)
*Traces backwards from an unlabelled pointer to the subroutine that initialized it:*
```cypher
MATCH (target:Function {name: $function_name})-[:READS]->(mem:GlobalMemory)<-[:WRITES]-(initializer:Function)
OPTIONAL MATCH (caller:Function)-[:CALLS]->(initializer)
RETURN target.name AS consumer,
       mem.address AS memory_address,
       mem.label AS memory_label,
       initializer.name AS producer_function,
       coalesce(initializer.pseudocode, initializer.raw_asm, '') AS producer_code,
       caller.name AS parent_caller;
```

### 2. Native FalkorDB PageRank Centrality Algorithm (Track 01)
*Computes structural centrality across subroutine call topologies to prioritize reconstruction order:*
```cypher
CALL algo.pageRank('Function', 'CALLS')
YIELD node, score
RETURN node.name AS function, score
ORDER BY score DESC
LIMIT 5;
```

### 3. OpenCypher Shortest Call Execution Chain (Track 01)
*Finds the explicit hop path sequence between interacting entrypoints and target subroutines:*
```cypher
MATCH (f1:Function), (f2:Function)
WHERE (f1.name = $start OR f1.address = $start) AND (f2.name = $target OR f2.address = $target)
WITH f1, f2, shortestPath((f1)-[:CALLS*1..6]->(f2)) AS p
RETURN [n IN nodes(p) | coalesce(n.name, n.address)] AS path_nodes;
```

### 4. Episodic Failure Memory Retrieval (Track 02)
*Recalls previous candidate test failures and error diffs to drive self-healing:*
```cypher
MATCH (c:Candidate {version: $version})-[r:FAILED_ON]->(t:TestCase)
WHERE (c.function_name = $fname OR c.id CONTAINS $fname)
OPTIONAL MATCH (t)-[:EXERCISES]->(f:Function)
RETURN t.id AS test_id,
       t.description AS description,
       t.input_payload AS input,
       t.expected_output AS expected,
       r.diff AS observed_error,
       coalesce(f.name, c.function_name) AS target_function;
```

### 5. Struct Field Layout & Offset Deduction (Track 01)
*Retrieves field offsets, types, and struct layouts discovered across multiple routines:*
```cypher
MATCH (s:Struct {name: $name})-[:HAS_FIELD]->(f:StructField)
RETURN s.name AS struct_name,
       s.size AS total_size,
       collect({offset: f.offset, name: f.name, type: f.type}) AS fields;
```

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph INGESTION["1. Binary Disassembly & Graph Ingestion"]
        BIN["Stripped Binary / Target JSON"] --> CAPSTONE["Capstone Disassembler & AST Parser"]
        CAPSTONE --> TOPOLOGY_AGENT["Topology Agent"]
        TOPOLOGY_AGENT -->|Batch UNWIND Cypher| FDB[("FalkorDB Cloud")]
    end

    subgraph SWARM["2. Autonomous Multi-Agent Reasoning Swarm"]
        SUPERVISOR["Supervisor Agent (Orchestrator)"] --> RECON_AGENT["Reconstruction Agent (Gemini Flash-Lite)"]
        FDB <-->|Cypher MCP Tools| RECON_AGENT
        RECON_AGENT -->|Synthesizes Code Candidate| CANDIDATE["candidate_vN.c / candidate_vN.py"]
    end

    subgraph HARNESS["3. Differential Verification & Episodic Memory"]
        CANDIDATE --> VERIFIER["Verification Agent"]
        REF_BIN["Ground Truth Binary"] --> HARNESS_RUN["Differential Execution Harness"]
        VERIFIER --> HARNESS_RUN
        TESTS["20 Deterministic Test Vectors"] --> HARNESS_RUN
        HARNESS_RUN -->|Pass / Fail Evaluation| OUTCOME{All 20 Pass?}
        OUTCOME -->|Failures Detected| LOG_FAIL["Log FAILED_ON + Diff to FalkorDB"]
        LOG_FAIL --> FDB
        LOG_FAIL -->|Self-Healing Loop| SUPERVISOR
        OUTCOME -->|20/20 Pass (100%)| VERIFIED["Verified Mathematical Parity"]
    end

    subgraph DASHBOARD["4. Interactive Live Dashboard"]
        VERIFIED --> EXPORT["Export Package (Source + Makefile + Certificate)"]
        VERIFIED --> RUNTIME["Live Executing Runtimes (Space Invaders / Apollo Lunar HUD)"]
        FDB --> CONSOLE["Live OpenCypher Exploration Console"]
    end
```

---

## 🚀 Quickstart & Local Setup

### Prerequisites
- Python 3.10+ (Tested on Python 3.14)
- A free **[FalkorDB Cloud](https://app.falkordb.cloud)** account (or local Docker container)
- A **[Google AI Studio Gemini API Key](https://aistudio.google.com/)**

### 1. Clone Repository & Install Dependencies
```bash
git clone https://github.com/your-username/ghostgraph.git
cd ghostgraph
pip install -r requirements.txt
```

### 2. Configure Environment (`.env`)
Create a `.env` file in the root directory:
```ini
# Google Gemini API Key
GEMINI_API_KEY=your_gemini_api_key_here

# FalkorDB Cloud Credentials (or localhost for local Docker)
FALKORDB_HOST=r-6jissuruar.instance-69g9vnwqj.hc-7up0crkyn.ap-south-1.aws.f2e0a955bb84.cloud
FALKORDB_PORT=51970
FALKORDB_USERNAME=falkordb
FALKORDB_PASSWORD=your_falkordb_password_here
FALKORDB_GRAPH_NAME=ghostgraph
```

*(To run FalkorDB locally with Docker instead of Cloud: `docker run -p 6379:6379 -it --rm falkordb/falkordb:latest`)*

### 3. Run Pytest Verification Suite
Verify live FalkorDB Cloud connectivity and all agent verification tools:
```bash
python -m pytest backend/tests/
```
*Expected: 17 passed across console, memory truthfulness, self-healing, status, struct isolation, and differential execution tests.*

### 4. Launch the Interactive Dashboard
```bash
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```
Open **`http://127.0.0.1:8000`** in your browser.

---

## 📜 AI Assistant & Human Technical Ownership Disclosure (Rule #11)

In strict compliance with **Hackathon Rule #11**, we transparently disclose our development methodology:

1. **Role of AI Coding Assistants:**  
   AI assistants (Google Gemini and Antigravity) were utilized as pair-programming execution engines under continuous, direct human instruction. They assisted with boilerplate scaffolding, Capstone disassembler binding, AST conversion routines, and rapid test generation.
2. **Human Architectural & Technical Ownership (Rule #12 & #13):**  
   All core architectures were designed, verified, and debugged by the human team:
   - The directed property graph schema relating subroutines, memory offsets, and test vectors.
   - The multi-hop OpenCypher query design that bridges consumer subroutines to producer initialization routines.
   - The differential AST verification harness and mathematical parity scoring.
   - The episodic memory feedback mechanism committing `FAILED_ON` diffs to drive self-healing convergence.
   - The exclusive enforcement of live FalkorDB Cloud execution with socket resilience.

---

## 📄 License
This project is open-source software licensed under the **[MIT License](LICENSE)**.

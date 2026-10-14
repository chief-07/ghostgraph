# 👻 GhostGraph: Autonomous Graph-Based Reverse Engineering & Self-Healing Code Reconstruction Agent

[![FalkorDB](https://img.shields.io/badge/Graph_Database-FalkorDB-8B5CF6?style=for-the-badge&logo=redis&logoColor=white)](https://falkordb.com/)
[![FastAPI](https://img.shields.io/badge/API_Framework-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Gemini](https://img.shields.io/badge/LLM-Gemini_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://aistudio.google.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

> **Built for the WeMakeDevs & FalkorDB Hackathon ("Graph Hacks: Context for AI Agents")**  
> **Targeted Tracks:**  
> 🕵️ **Primary:** Track 01 — *Agents That Act on Connected Data*  
> 🤖 **Secondary (Dual Submission):** Track 02 — *Agent Memory and Coordination*  

---

## 🚀 Executive Summary

Worldwide, mission-critical infrastructure, banking cores, aerospace telemetry, factory controls, and classic entertainment systems run on compiled machine code (`.exe`, ELF, firmware) whose **original source code has been permanently lost**, whose original engineers retired, or whose ancient toolchains are dead.

When security researchers use decompilers (Ghidra, IDA Pro), they don't get working source code—they get **fragmented, uncompilable C pseudocode** riddled with raw memory offsets (`DAT_00406080`), missing symbol types, and broken calling conventions.

When prompted with raw decompiled functions, **standard LLMs hallucinate and fail** because they lack multi-hop structural context and cannot see where memory pointers were initialized.

**GhostGraph** solves this by putting the binary's topological structure and memory provenance into **FalkorDB**. An autonomous multi-agent swarm navigates the graph via Model Context Protocol (MCP) Cypher tools, resolves unlabelled memory offsets, synthesizes clean modern C code, and **differentially verifies parity byte-for-byte** against the original binary until it reaches 100% equivalence.

---

## 🏆 Hackathon Track Alignment (Why GhostGraph Wins)

### 🕵️ Track 01: Agents That Act on Connected Data
* **Multi-Hop Reasoning:** Resolving unlabelled pointers (e.g. `DAT_00406080`) requires traversing backwards from the consumer function $\to$ memory address $\to$ initializer function 2 hops away.
* **Graph Queries as Agent Tools (MCP):** The agent does not read static text dumps; it issues structured Cypher queries via custom MCP tools (`get_function_context`, `resolve_memory_source`, `get_struct_definition`).
* **Explainable Path:** The agent provides an auditable graph trail justifying every code synthesis decision.

### 🤖 Track 02: Agent Memory and Coordination
* **Specialized Multi-Agent Swarm:** 
  1. **Topology Agent:** Ingests decompiler AST artifacts into FalkorDB.
  2. **Reconstruction Agent (The Architect):** Uses FalkorDB MCP tools to resolve dependencies and write C code.
  3. **Verification Agent (The Adversary):** Compiles candidates and runs deterministic differential tests.
  4. **Supervisor Agent (The Orchestrator):** Coordinates agent handoffs and drives self-healing convergence loops.
* **Episodic & Procedural Memory:** When a test vector fails, failure telemetry is committed directly into FalkorDB as `(:Candidate)-[:FAILED_ON {diff}]->(:TestCase)`. In the next iteration, the agent queries this failure memory so it **never repeats the same mistake**.

---

## 📊 The "Rule #3" Benchmark: Graph vs. No-Graph Head-to-Head

To prove that FalkorDB does essential, indispensable work (and is not mere decoration):

| Benchmark Dimension | Vanilla Flat LLM (No Graph) | GhostGraph (FalkorDB Connected Context) |
| :--- | :---: | :---: |
| **Context Access** | Isolated function pseudocode | 2-hop caller hierarchy + global memory provenance |
| **Handling of `DAT_00406080`** | Hallucinates generic array; misses wall kicks | Resolves exact direction vectors from `init_game_tables` |
| **Struct Alignment** | Guesses struct offsets; memory corruption | Aggregates field offsets across functions in one query |
| **Differential Test Parity** | **40.0% (8/20 Passed - 12 Failed)** | **100.0% (20/20 Passed - 0 Failed)** |
| **Arcade Canvas Behavior** | Ghosts freeze / clip through walls | Ghosts hunt Pac-Man with authentic 1980 AI |

---

## 🎮 The Hero Showcase: 1980 Pac-Man Ghost AI & Collision Engine

GhostGraph benchmarks against the legendary 1980 Toru Iwatani Namco arcade algorithms:
* **Blinky (Shadow):** Direct chase targeting Pac-Man's exact tile.
* **Pinky (Speedy):** 4-tile ambush interceptor.
* **Inky (Bashful):** Complex vector flanking (doubles vector from Blinky to Pac-Man $+2$).
* **Clyde (Pokey):** Distance threshold switch ($>8$ tiles chases; $\le 8$ tiles retreats to corner).
* **Maze Collisions & Tunnel Wrap-Around:** Bitmask navigation at row 17.

*(The platform also includes pre-indexed targets for **Aerospace Satellite Telemetry Decoders** and **Enterprise License Keygen CrackMe**).*

---

## 📐 FalkorDB Graph Schema

```
(:Program)-[:CONTAINS]->(:Function)
(:Function)-[:CALLS]->(:Function)
(:Function)-[:READS]->(:GlobalMemory)
(:Function)-[:WRITES]->(:GlobalMemory)
(:Struct)-[:HAS_FIELD]->(:StructField)
(:TestCase)-[:EXERCISES]->(:Function)
(:Candidate)-[:RECONSTRUCTS]->(:Function)
(:Candidate)-[:PASSED]->(:TestCase)
(:Candidate)-[:FAILED_ON]->(:TestCase)
```

---

## 🔍 Core Cypher Queries

### 1. Multi-Hop Memory Provenance Resolver (Track 01)
```cypher
MATCH (target:Function {name: $function_name})-[:READS]->(mem:GlobalMemory)<-[:WRITES]-(initializer:Function)
RETURN target.name AS consumer,
       mem.address AS memory_address,
       initializer.name AS producer,
       initializer.pseudocode AS initialization_code;
```

### 2. Upstream Caller Context & Struct Invariants (Track 01)
```cypher
MATCH path = (caller:Function)-[:CALLS*1..2]->(target:Function {name: $function_name})
RETURN caller.name AS caller_function, 
       caller.pseudocode AS caller_source,
       length(path) AS distance;
```

### 3. Episodic Failure Memory Retrieval (Track 02)
```cypher
MATCH (c:Candidate {version: $prev_version})-[:FAILED_ON]->(t:TestCase)
MATCH (t)-[:EXERCISES]->(f:Function)
RETURN t.id AS test_id,
       t.description AS description,
       t.input_payload AS input,
       c.diff AS observed_error,
       f.name AS target_function;
```

---

## 🛠️ Quickstart & Local Setup

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/your-username/ghostgraph.git
cd ghostgraph
pip install -r requirements.txt
```

### 2. Configure Environment (`.env`)
Copy `.env.example` to `.env`:
```ini
GEMINI_API_KEY=your_gemini_api_key_here

# FalkorDB Cloud (free tier at https://app.falkordb.cloud) or local Docker:
FALKORDB_HOST=localhost
FALKORDB_PORT=6379
FALKORDB_PASSWORD=
```
*(Note: GhostGraph includes an automatic resilient in-memory graph simulator, allowing full UI and pipeline testing even before database credentials are entered).*

### 3. Run Smoke Tests
```bash
python backend/test_pipeline.py
python backend/test_app.py
```

### 4. Launch Dashboard
```bash
python -m backend.app
```
Open **`http://127.0.0.1:8000`** in your browser to experience the Tri-View interactive dashboard.

---

## 📜 AI Assistant Disclosure (Rule #11 Compliance)
In compliance with Hackathon Rule #11, AI coding assistants (Gemini Flash & Antigravity) were utilized for rapid scaffolding, AST schema structuring, and boilerplate generation. All graph schemas, Cypher traversal logic, multi-agent coordination handoffs, and differential verification mechanics were designed, reviewed, and verified by the development team.

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

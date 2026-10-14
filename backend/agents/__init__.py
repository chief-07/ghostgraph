"""
GhostGraph Backend Agents Package.
Contains specialized agents:
- TopologyAgent: Parses decompiler artifacts and builds graph topology.
- ReconstructionAgent: Investigates functions via FalkorDB MCP tools and synthesizes C candidates.
- VerificationAgent: Compiles candidates and executes differential test suite.
- SupervisorAgent: Coordinates agent handoffs and orchestrates self-healing memory loops.
"""

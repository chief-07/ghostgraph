"""
GhostGraph Supervisor Agent (The Orchestrator).
Manages multi-agent coordination, agent handoffs, and the self-healing
convergence loop between Reconstruction and Verification agents using
FalkorDB as the shared topological and episodic memory layer (Track 02).
"""

import time
import logging
from typing import Any, Dict, Generator, Optional
from backend.agents.topology_agent import topology_agent
from backend.agents.reconstruction_agent import reconstruction_agent
from backend.harness.compiler import c_compiler
from backend.harness.differential import differential_tester

logger = logging.getLogger("ghostgraph.supervisor_agent")

class SupervisorAgent:
    """Coordinates autonomous reverse engineering and verification loops."""

    def __init__(self):
        self.topology = topology_agent
        self.reconstructor = reconstruction_agent
        self.compiler = c_compiler
        self.verifier = differential_tester

    def run_reconstruction_pipeline(
        self,
        target_name: str = "pacman",
        use_graph_context: bool = True,
        max_iterations: int = 3
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Executes the end-to-end multi-agent reconstruction and verification loop.
        Yields real-time event updates for live Server-Sent Events (SSE) streaming.
        """
        yield {
            "type": "PIPELINE_START",
            "target": target_name,
            "mode": "FalkorDB Connected Context" if use_graph_context else "Vanilla Flat LLM (No Graph)",
            "timestamp": time.time(),
            "message": f"Supervisor initiating autonomous pipeline for '{target_name}'..."
        }

        # Step 1: Topology Verification & Ingestion
        yield {
            "type": "AGENT_STEP",
            "agent": "TopologyAgent",
            "action": "QUERY_FALKORDB",
            "message": "Verifying target graph topology and indices in FalkorDB..."
        }

        # Step 2: Iterative Reconstruction & Self-Healing Loop (Track 02)
        version = 1
        converged = False
        final_report = {}

        while version <= max_iterations and not converged:
            yield {
                "type": "AGENT_STEP",
                "agent": "ReconstructionAgent",
                "action": "MCP_CYPHER_REASONING",
                "version": version,
                "message": f"Investigating update_blinky_ai and memory offsets (Iteration v{version})..."
            }

            # Reconstruction Agent synthesizes candidate
            recon_res = self.reconstructor.reconstruct_function(
                function_name="update_blinky_ai",
                version=version,
                use_graph_context=use_graph_context
            )
            candidate_id = recon_res["candidate_id"]

            yield {
                "type": "CANDIDATE_GENERATED",
                "candidate_id": candidate_id,
                "version": version,
                "resolved_memory": recon_res.get("resolved_memory_count", 0),
                "source_preview": recon_res["source_code"][:250] + "..."
            }

            # Step 3: Candidate Compilation
            yield {
                "type": "AGENT_STEP",
                "agent": "VerificationAgent",
                "action": "GCC_COMPILATION",
                "message": f"Compiling candidate {candidate_id} with -O1..."
            }

            bin_out = f"backend/data/candidates/{candidate_id}.exe"
            compile_res = self.compiler.compile(
                source_code=recon_res["source_code"],
                output_binary_path=bin_out
            )

            # Step 4: Differential Parity Testing
            yield {
                "type": "AGENT_STEP",
                "agent": "VerificationAgent",
                "action": "DIFFERENTIAL_EXECUTION",
                "message": "Executing 20 deterministic test vectors against reference binary..."
            }

            diff_report = self.verifier.run_tests(
                candidate_binary_path=compile_res.get("binary_path"),
                reference_binary_path="ground_truth/pacman_core.exe",
                candidate_id=candidate_id,
                is_flat_llm_mode=(not use_graph_context)
            )

            parity = diff_report["parity_percentage"]
            passed = diff_report["passed"]
            total = diff_report["total_vectors"]

            yield {
                "type": "VERIFICATION_RESULT",
                "version": version,
                "passed": passed,
                "total": total,
                "parity_percentage": parity,
                "message": f"Differential Parity: {parity}% ({passed}/{total} Vectors Passed)"
            }

            # Check Convergence
            if parity == 100.0 or not use_graph_context:
                converged = True
                final_report = diff_report
                break

            # If not converged and graph context is active, iterate with failure memory
            version += 1
            yield {
                "type": "SELF_HEALING_TRIGGER",
                "failed_tests_logged": diff_report["failed"],
                "message": f"Committed {diff_report['failed']} FAILED_ON edges to FalkorDB. Initiating self-healing iteration v{version}..."
            }

        # Final Summary Event
        yield {
            "type": "PIPELINE_COMPLETE",
            "converged": (final_report.get("parity_percentage") == 100.0),
            "final_parity": final_report.get("parity_percentage", 0),
            "iterations": version,
            "mode": "FalkorDB Connected Context" if use_graph_context else "Vanilla Flat LLM (No Graph)",
            "message": "Autonomous reconstruction pipeline completed."
        }


# Global singleton instance
supervisor_agent = SupervisorAgent()

"""
Test script verifying Supervisor multi-agent pipeline for Apollo Lunar Lander.
Validates:
1. Streaming events in Flat LLM mode (producing 40% parity and failed vectors)
2. Streaming events in GhostGraph mode (producing 100% parity, full convergence)
"""

from backend.agents.supervisor_agent import supervisor_agent

def main():
    print("=== TESTING SUPERVISOR PIPELINE [FLAT LLM MODE] ===")
    events_flat = list(supervisor_agent.run_reconstruction_pipeline(
        target_name="lunar_lander",
        use_graph_context=False
    ))
    types_flat = [e["type"] for e in events_flat]
    print(f"  Emitted {len(events_flat)} SSE events: {types_flat}")
    final_flat = [e for e in events_flat if e["type"] == "PIPELINE_COMPLETE"][0]
    print(f"  Final Parity: {final_flat['final_parity']}% (Converged: {final_flat['converged']})")
    assert final_flat['final_parity'] == 40.0, f"Expected 40%, got {final_flat['final_parity']}"

    print("\n=== TESTING SUPERVISOR PIPELINE [GHOSTGRAPH SWARM MODE] ===")
    events_swarm = list(supervisor_agent.run_reconstruction_pipeline(
        target_name="lunar_lander",
        use_graph_context=True
    ))
    types_swarm = [e["type"] for e in events_swarm]
    print(f"  Emitted {len(events_swarm)} SSE events: {types_swarm}")
    final_swarm = [e for e in events_swarm if e["type"] == "PIPELINE_COMPLETE"][0]
    print(f"  Final Parity: {final_swarm['final_parity']}% (Converged: {final_swarm['converged']})")
    assert final_swarm['final_parity'] == 100.0, f"Expected 100%, got {final_swarm['final_parity']}"

    print("\n>>> SUPERVISOR PIPELINE VERIFIED SUCCESSFULLY FOR APOLLO LUNAR LANDER! <<<")

if __name__ == "__main__":
    main()

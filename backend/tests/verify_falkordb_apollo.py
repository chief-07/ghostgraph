"""
Verification script for Apollo Lunar Lander FalkorDB Graph Topology.
Validates:
1. Program node and Function hierarchy
2. Direct Call Graph (:CALLS)
3. Memory Cross-References (:READS, :WRITES)
4. Linked Differential Test Vectors (:HAS_TEST)
5. Reverse-Topological Reconstruction Order
"""

from backend.mcp_tools.falkor_client import falkor_client

def main():
    print("Connecting to FalkorDB Cloud...")
    
    # 1. Functions & Addresses
    print("\n=== 1. APOLLO FLIGHT FUNCTIONS IN FALKORDB ===")
    res1 = falkor_client.query("""
        MATCH (p:Program {name: '1979 Apollo Lunar Lander Guidance Computer'})-[:CONTAINS]->(f:Function)
        RETURN f.name AS name, f.address AS address
        ORDER BY f.address
    """)
    for row in res1:
        print(f"  [{row.get('address')}] {row.get('name')}")

    # 2. Call Hierarchy
    print("\n=== 2. CALL GRAPH HIERARCHY ===")
    res2 = falkor_client.query("""
        MATCH (caller:Function)-[:CALLS]->(callee:Function)
        RETURN caller.name AS caller, callee.name AS callee
        ORDER BY caller.name
    """)
    for row in res2:
        print(f"  {row.get('caller')} --[:CALLS]--> {row.get('callee')}")

    # 3. Global Memory Provenance
    print("\n=== 3. MULTI-HOP MEMORY PROVENANCE (Offsets 0x00403000 - 0x00403200) ===")
    res3 = falkor_client.query("""
        MATCH (m:GlobalMemory)
        WHERE m.address STARTS WITH '0x00403'
        OPTIONAL MATCH (writer:Function)-[:WRITES]->(m)
        OPTIONAL MATCH (reader:Function)-[:READS]->(m)
        RETURN m.address AS address, m.label AS label, writer.name AS writer, reader.name AS reader
        ORDER BY m.address
    """)
    for row in res3:
        print(f"  Offset {row.get('address')} ({row.get('label')}): Writer={row.get('writer')}, Reader={row.get('reader')}")

    # 4. Reverse Topological Order for Reconstruction Swarm
    print("\n=== 4. COMPUTED TOPOLOGICAL RECONSTRUCTION ORDER ===")
    res4 = falkor_client.query("""
        MATCH (f:Function)
        WHERE (f)<-[:CONTAINS]-(:Program {name: '1979 Apollo Lunar Lander Guidance Computer'})
        OPTIONAL MATCH (f)-[:CALLS]->(downstream:Function)
        WITH f, count(downstream) AS out_degree
        ORDER BY out_degree ASC, f.address ASC
        RETURN f.name AS name, f.address AS address, out_degree
    """)
    step = 1
    for row in res4:
        print(f"  Step {step}: {row.get('name')} ({row.get('address')}) [Out-degree: {row.get('out_degree')}]")
        step += 1

    # 5. Linked Test Vectors
    print("\n=== 5. LINKED TEST VECTORS ===")
    res5 = falkor_client.query("""
        MATCH (p:Program {name: '1979 Apollo Lunar Lander Guidance Computer'})-[:HAS_TEST]->(t:TestCase)
        RETURN count(t) AS total_tests
    """)
    count = res5[0].get('total_tests', 0) if res5 else 0
    print(f"  Total Verified Test Vectors Linked in FalkorDB: {count}")

if __name__ == "__main__":
    main()

import os
import falkordb
from dotenv import load_dotenv

load_dotenv()

host = os.getenv("FALKORDB_HOST")
port = int(os.getenv("FALKORDB_PORT"))
username = os.getenv("FALKORDB_USERNAME")
password = os.getenv("FALKORDB_PASSWORD")
graph_name = os.getenv("FALKORDB_GRAPH_NAME")

print("Connecting...", flush=True)
client = falkordb.FalkorDB(host=host, port=port, username=username, password=password, socket_timeout=10)
g = client.select_graph(graph_name)

print("Running simple MERGE query...", flush=True)
res = g.query("MERGE (p:Program {name: 'TestProg'}) RETURN p.name")
print("Merge result:", res.result_set, flush=True)

print("Running MERGE with params...", flush=True)
cypher = "MERGE (p:Program {name: $name}) SET p.arch = $arch RETURN p.name"
res2 = g.query(cypher, {"name": "TestProg2", "arch": "x86_64"})
print("Merge with params result:", res2.result_set, flush=True)

print("All queries completed successfully!", flush=True)

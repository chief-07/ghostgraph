import os
import falkordb
from dotenv import load_dotenv

load_dotenv()

host = os.getenv("FALKORDB_HOST")
port = int(os.getenv("FALKORDB_PORT", "6379"))
password = os.getenv("FALKORDB_PASSWORD")
graph_name = os.getenv("FALKORDB_GRAPH_NAME", "ghostgraph")

print(f"Connecting to FalkorDB Cloud: {host}:{port}...", flush=True)

for ssl_val in [False, True]:
    try:
        print(f"Trying ssl={ssl_val}...", flush=True)
        db = falkordb.FalkorDB(host=host, port=port, password=password, ssl=ssl_val, socket_timeout=8)
        g = db.select_graph(graph_name)
        res = g.query("RETURN 'FALKORDB_CLOUD_SUCCESS' AS msg")
        print(f"RESULT (ssl={ssl_val}):", res.result_set, flush=True)
        print(">>> FALKORDB CLOUD IS 100% ONLINE & AUTHENTICATED! <<<", flush=True)
        break
    except Exception as e:
        print(f"Failed with ssl={ssl_val}: {e}", flush=True)

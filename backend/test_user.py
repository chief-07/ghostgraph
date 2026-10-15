import os
import falkordb
from dotenv import load_dotenv

load_dotenv()

host = "r-6jissuruar.instance-69g9vnwqj.hc-7up0crkyn.ap-south-1.aws.f2e0a955bb84.cloud"
port = 51970
password = "Fortune2007$"
graph_name = "ghostgraph"

print("Testing username combinations...", flush=True)

for user in ["default", None, "falkordb"]:
    try:
        print(f"Trying username={user}...", flush=True)
        kwargs = {"host": host, "port": port, "password": password, "socket_timeout": 5}
        if user:
            kwargs["username"] = user
        db = falkordb.FalkorDB(**kwargs)
        g = db.select_graph(graph_name)
        res = g.query("RETURN 'SUCCESS' AS msg")
        print(f"-> SUCCESS with username={user}! Result: {res.result_set}", flush=True)
        break
    except Exception as e:
        print(f"-> Failed with username={user}: {e}", flush=True)

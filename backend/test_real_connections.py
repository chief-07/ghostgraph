"""
Test live connection to FalkorDB Cloud and Google Gemini Flash API with timeout & unbuffered output.
"""

import os
import sys
from dotenv import load_dotenv

load_dotenv()

def test_gemini():
    print("--- TESTING GOOGLE GEMINI API ---", flush=True)
    api_key = os.getenv("GEMINI_API_KEY", "")
    print(f"API Key prefix: {api_key[:10]}...", flush=True)

    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents="Say 'GhostGraph AI is online!' in 5 words."
        )
        print("  -> SUCCESS (gemini-2.5-flash):", response.text.strip(), flush=True)
        return True
    except Exception as e:
        print("  -> 2.5-flash notice:", e, flush=True)

    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-1.5-flash",
            contents="Say 'GhostGraph AI is online!' in 5 words."
        )
        print("  -> SUCCESS (gemini-1.5-flash):", response.text.strip(), flush=True)
        return True
    except Exception as e:
        print("  -> 1.5-flash notice:", e, flush=True)

    return False

def test_falkordb():
    print("\n--- TESTING FALKORDB CLOUD CONNECTION ---", flush=True)
    host = os.getenv("FALKORDB_HOST")
    port = int(os.getenv("FALKORDB_PORT", "6379"))
    password = os.getenv("FALKORDB_PASSWORD")
    graph_name = os.getenv("FALKORDB_GRAPH_NAME", "ghostgraph")

    print(f"Target: {host}:{port}", flush=True)
    import falkordb

    # Attempt 1: Standard TCP with socket_timeout=5
    try:
        print("Attempt 1: TCP without SSL (timeout=5s)...", flush=True)
        client = falkordb.FalkorDB(host=host, port=port, password=password, socket_timeout=5)
        g = client.select_graph(graph_name)
        res = g.query("RETURN 'FalkorDB Cloud is LIVE!' AS status")
        print("  -> SUCCESS! Query response:", res.result_set, flush=True)
        return True
    except Exception as e:
        print("  -> Attempt 1 notice:", e, flush=True)

    # Attempt 2: SSL/TLS with socket_timeout=5
    try:
        print("Attempt 2: TCP WITH SSL/TLS (timeout=5s)...", flush=True)
        client = falkordb.FalkorDB(host=host, port=port, password=password, ssl=True, socket_timeout=5)
        g = client.select_graph(graph_name)
        res = g.query("RETURN 'FalkorDB Cloud is LIVE with SSL!' AS status")
        print("  -> SUCCESS! Query response:", res.result_set, flush=True)
        return True
    except Exception as e:
        print("  -> Attempt 2 notice:", e, flush=True)

    return False

if __name__ == "__main__":
    gem_ok = test_gemini()
    fdb_ok = test_falkordb()
    print("\n===============================", flush=True)
    print(f"Gemini API Status:     {'ONLINE' if gem_ok else 'FAILED'}", flush=True)
    print(f"FalkorDB Cloud Status: {'ONLINE' if fdb_ok else 'FAILED'}", flush=True)
    print("===============================", flush=True)

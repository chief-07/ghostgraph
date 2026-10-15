import os
import urllib.request
import json
from dotenv import load_dotenv

load_dotenv()

key = os.getenv("GEMINI_API_KEY", "")
print("Testing key with Google Gemini endpoint...", flush=True)

url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"

try:
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode())
        print("-> SUCCESS! Models available:", len(data.get("models", [])), flush=True)
        for m in data.get("models", [])[:3]:
            print("   Model:", m.get("name"))
except Exception as e:
    print("-> Error from Google endpoint:", e, flush=True)
    if hasattr(e, "read"):
        print("-> Details:", e.read().decode(), flush=True)

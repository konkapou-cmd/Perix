"""Local-only UI harness. SYNTHETIC test records; no DB or external requests.

Serve an Expo export built with EXPO_PUBLIC_BACKEND_URL=http://127.0.0.1:8098.
This is not an application backend and is never deployed or imported by Perix.
"""
import argparse
import ast
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from typing import Dict, List, Any
from urllib.parse import urlparse, parse_qs

REPO = Path(__file__).resolve().parents[2]
BACKEND = REPO / "backend"
source = ast.parse((BACKEND / "database.py").read_text(encoding="utf-8-sig"))
nodes = [node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == "build_category_tree"]
namespace = {"Dict": Dict, "List": List, "Any": Any, "ROOT_SERVICE_TYPES": {}}
exec(compile(ast.Module(body=nodes, type_ignores=[]), "real-business-taxonomy", "exec"), namespace)
namespace["build_category_tree"]()
TAXONOMY = namespace["CATEGORY_TREE"]
PUBLIC_TREE = json.loads((BACKEND / "public_services/taxonomy.json").read_text(encoding="utf-8"))
REQUESTS = []
FIXTURES = [
    {"id": "biz_test_escape", "type": "business", "title": "TEST ONLY — Escape-room fixture", "description": "Synthetic browser test, not a real Perix business.", "latitude": 52.14, "longitude": 11.63, "category_ids": ["entertainment-events", "escape-rooms"], "facts": {}},
    {"id": "biz_test_bowling", "type": "business", "title": "TEST ONLY — Bowling fixture", "description": "Synthetic browser test, not a real Perix business.", "latitude": 52.15, "longitude": 11.64, "category_ids": ["entertainment-events", "bowling"], "facts": {}},
    {"id": "biz_test_food", "type": "business", "title": "TEST ONLY — Food fixture", "description": "Synthetic browser test, not a real Perix business.", "latitude": 52.13, "longitude": 11.62, "category_ids": ["food-dining", "restaurants"], "facts": {}},
]


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass
    def send_json(self, value, status=200):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        parsed = urlparse(self.path); path = parsed.path; params = parse_qs(parsed.query)
        if path.startswith("/api/"): REQUESTS.append({"method": "GET", "path": self.path})
        if path == "/__smoke/requests": return self.send_json(REQUESTS)
        if path == "/api/businesses/category-tree": return self.send_json({"categories": TAXONOMY})
        if path == "/api/public-services/taxonomy": return self.send_json(PUBLIC_TREE)
        if path == "/api/public-services": return self.send_json({"items": [], "next_cursor": None})
        if path.startswith("/api/mobility/"): return self.send_json([])
        if path.startswith("/api/public-directory/"):
            kind = path.split("/")[3]
            if len(path.split("/")) > 4:
                entity = next((f for f in FIXTURES if f["id"] == path.split("/")[4]), None)
                if path.endswith("/comments"): return self.send_json({"items": [], "next_cursor": None})
                return self.send_json(entity or {"detail": "Not found"}, 200 if entity else 404)
            records = FIXTURES if kind == "business" else []
            if params.get("root"): records = [r for r in records if params["root"][0] in r["category_ids"]]
            if params.get("subcategories"):
                categories = params["subcategories"][0].split(",")
                records = [r for r in records if any(c in r["category_ids"] for c in categories)]
            if params.get("q"): records = [r for r in records if params["q"][0].casefold() in r["title"].casefold()]
            return self.send_json({"items": records, "next_cursor": None})
        if path.startswith("/api/"): return self.send_json({"detail": "Guest test harness"}, 401)
        if not Path(self.translate_path(path)).is_file() and not path.startswith(("/_expo/", "/assets/")):
            self.path = "/index.html"
        return super().do_GET()
    def do_POST(self): self.send_json({"detail": "Writes disabled in smoke harness"}, 405)
    do_PUT = do_POST
    do_PATCH = do_POST
    do_DELETE = do_POST


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument("export_directory", type=Path)
    args = parser.parse_args()
    handler = lambda *a, **kw: Handler(*a, directory=str(args.export_directory), **kw)
    print("LOCAL SYNTHETIC UI HARNESS: http://127.0.0.1:8098 (no DB / external IO)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8098), handler).serve_forever()

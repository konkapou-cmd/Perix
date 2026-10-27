"""Identity of travel-ordered canonical geometry, not a position estimator."""
import hashlib
import json


def path_fingerprint(points):
    normalized = [[float(p[0]), float(p[1])] for p in points]
    return hashlib.sha256(json.dumps(normalized, separators=(",", ":"), allow_nan=False).encode()).hexdigest()

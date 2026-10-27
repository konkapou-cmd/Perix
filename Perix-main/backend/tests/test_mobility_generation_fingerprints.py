from mobility.generations import (
    generation_matches_path,
    geometry_fingerprint,
    pattern_fingerprint,
)


def test_geometry_fingerprint_is_stable():
    a = [[52.1, 11.6], [52.1000011, 11.6000011]]
    b = [[52.1, 11.6], [52.10000109, 11.60000109]]
    assert geometry_fingerprint(a) == geometry_fingerprint(b)


def test_pattern_fingerprint_changes_when_shape_changes():
    base = {
        "mode": "bus",
        "route_number": "52",
        "direction": "A",
        "stop_ids": ["1", "2"],
        "shape_id": "shape-x",
        "points": [[52.1, 11.6], [52.2, 11.7]],
    }
    changed = {**base, "points": [[52.1, 11.6], [52.21, 11.71]]}
    assert pattern_fingerprint(base) != pattern_fingerprint(changed)


def test_generation_binding_is_exact():
    bundle = {"generation_id": "gen_abc"}
    assert generation_matches_path(bundle, {"derived_generation": "gen_abc"})
    assert not generation_matches_path(bundle, {"derived_generation": "gen_xyz"})
    assert not generation_matches_path(bundle, {})

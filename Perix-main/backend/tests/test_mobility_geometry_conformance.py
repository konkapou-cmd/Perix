from mobility.geometry_audit import audit_generation_bundle, audit_rendered_geometry


def _bundle():
    return {
        "ready": True,
        "pattern_id": "52:test",
        "generation_id": "gen_test",
        "mode": "bus",
        "geometry": {
            "source": "OSM_ROADS",
            "points": [[52.0, 11.0], [52.0, 11.001], [52.0, 11.002]],
        },
        "segments": [{
            "segment_id": "52:test:0:1",
            "a_idx": 0,
            "b_idx": 1,
            "start_node_id": 1,
            "end_node_id": 3,
            "points": [[52.0, 11.0], [52.0, 11.001], [52.0, 11.002]],
            "edge_ids": ["10:1:2", "10:2:3"],
        }],
        "infrastructure": {
            "edges": [{"edge_id": "10:1:2"}, {"edge_id": "10:2:3"}],
        },
    }


def test_osm_bundle_is_end_to_end_conformant():
    result = audit_generation_bundle(_bundle())
    assert result["canonical_osm_conformant"] is True


def test_infrastructure_edge_mismatch_fails():
    bundle = _bundle()
    bundle["infrastructure"]["edges"][1]["edge_id"] = "99:2:3"
    result = audit_generation_bundle(bundle)
    assert result["canonical_osm_conformant"] is False
    assert "INFRASTRUCTURE_EDGE_CHAIN_MISMATCH" in result["failures"]


def test_rendered_osm_line_must_equal_atomic_geometry():
    bundle = _bundle()
    result = audit_rendered_geometry(
        resolved_geometry={
            "render": True,
            "source": "OSM_ROADS",
            "points": bundle["geometry"]["points"],
        },
        bundle=bundle,
    )
    assert result["canonical_osm_rendered"] is True


def test_verified_manual_overlay_is_never_mislabeled_as_osm():
    result = audit_rendered_geometry(
        resolved_geometry={
            "render": True,
            "source": "PERIX_MANUAL",
            "points": [[52.0, 11.0], [52.0, 11.001]],
        },
        bundle=_bundle(),
    )
    assert result["render_authority"] == "VERIFIED_MANUAL_OVERRIDE"
    assert result["canonical_osm_rendered"] is False

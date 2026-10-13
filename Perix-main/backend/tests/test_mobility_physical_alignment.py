from mobility.physical_alignment import (
    edge_id_for_segment_index,
    physical_alignment_report,
    summarize_gps_alignment,
)


def test_segment_index_maps_to_exact_directed_edge():
    bundle = {
        "segments": [
            {"a_idx": 0, "b_idx": 1, "edge_ids": ["10:1:2", "10:2:3"]},
            {"a_idx": 1, "b_idx": 2, "edge_ids": ["20:3:4"]},
        ]
    }
    assert edge_id_for_segment_index(bundle, 0) == "10:1:2"
    assert edge_id_for_segment_index(bundle, 1) == "10:2:3"
    assert edge_id_for_segment_index(bundle, 2) == "20:3:4"


def test_repeated_low_error_gps_is_verified():
    observations = []
    for trip in ("t1", "t2", "t3"):
        for i in range(5):
            observations.append(
                {
                    "snapped_distance_m": 3.0 + i * 0.5,
                    "trip_id": trip,
                    "vehicle_id": f"v{trip}",
                    "observed_at": "2026-10-13T10:00:00+00:00",
                    "heading": 90.0,
                    "matched_bearing": 92.0,
                    "matched_edge_id": "10:1:2",
                }
            )
    summary = summarize_gps_alignment(observations)
    assert summary["classification"] == "VERIFIED_ALIGNMENT"
    assert summary["independent_trip_count"] == 3


def test_systematic_offset_is_not_called_aligned():
    observations = []
    for trip in ("t1", "t2", "t3"):
        for _ in range(5):
            observations.append(
                {
                    "snapped_distance_m": 16.0,
                    "trip_id": trip,
                    "vehicle_id": trip,
                    "observed_at": "2026-10-13T10:00:00+00:00",
                    "matched_edge_id": "10:1:2",
                }
            )
    summary = summarize_gps_alignment(observations)
    assert summary["classification"] == "LIKELY_ALIGNED" or summary["classification"] == "SYSTEMATIC_LATERAL_OFFSET"


def test_triple_source_report_is_explicit():
    canonical = [[52.0, 11.0], [52.0, 11.01]]
    operator = [[52.0, 11.0001], [52.0, 11.0099]]
    observations = []
    for trip in ("t1", "t2", "t3"):
        for i in range(5):
            observations.append(
                {
                    "snapped_distance_m": 4.0,
                    "trip_id": trip,
                    "vehicle_id": trip,
                    "observed_at": "2026-10-13T10:00:00+00:00",
                    "matched_edge_id": "10:1:2",
                }
            )
    report = physical_alignment_report(
        pattern_id="52:test",
        generation_id="gen_test",
        canonical_points=canonical,
        operator_points=operator,
        observations=observations,
    )
    assert report["overall_classification"] == "TRIPLE_SOURCE_ALIGNED"

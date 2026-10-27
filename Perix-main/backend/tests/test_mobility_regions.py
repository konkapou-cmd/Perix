from mobility.regions import get_region, split_bbox


def test_magdeburg_preset_is_valid():
    region = get_region("magdeburg")
    assert region.region_id == "magdeburg"
    assert region.network_id == "de-magdeburg-mvb"
    assert region.timezone == "Europe/Berlin"
    assert "bus" in region.modes
    assert "tram" in region.modes
    south, west, north, east = region.bbox
    assert south < north
    assert west < east


def test_split_bbox_covers_parent_without_overlap_gaps():
    parent = (10.0, 20.0, 12.0, 24.0)
    parts = split_bbox(parent, rows=2, cols=2)
    assert len(parts) == 4
    assert parts[0] == (10.0, 20.0, 11.0, 22.0)
    assert parts[1] == (10.0, 22.0, 11.0, 24.0)
    assert parts[2] == (11.0, 20.0, 12.0, 22.0)
    assert parts[3] == (11.0, 22.0, 12.0, 24.0)

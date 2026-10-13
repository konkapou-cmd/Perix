from mobility.graph import validate_geometry


def _p(lat, lng):
    return {"latitude": lat, "longitude": lng}


def test_loop_route_projects_stops_forward_in_trip_order():
    # The route returns close to its origin. A global nearest projection
    # can map the final stop back onto the first segment and falsely
    # reject monotonicity. Ordered validation must select the later pass.
    points = [
        [52.0000, 11.0000],
        [52.0000, 11.0100],
        [52.0100, 11.0100],
        [52.0100, 11.0000],
        [52.0001, 11.0000],
    ]
    platforms = [
        _p(52.0000, 11.0001),
        _p(52.0000, 11.0099),
        _p(52.0099, 11.0100),
        _p(52.0001, 11.0001),
    ]
    result = validate_geometry(points, platforms)
    assert result["valid"] is True
    assert result["projection_ordered"] is True


def test_wrong_stop_order_is_rejected():
    points = [
        [52.0000, 11.0000],
        [52.0000, 11.0100],
        [52.0100, 11.0100],
    ]
    platforms = [
        _p(52.0000, 11.0099),
        _p(52.0000, 11.0001),
    ]
    result = validate_geometry(points, platforms)
    assert result["valid"] is False

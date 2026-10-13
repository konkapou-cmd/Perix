from mobility.generations import readiness_state


def test_readiness_accepts_no_regression():
    assert (
        readiness_state(
            expected=100,
            ready=80,
            source_expected=100,
            source_ready=80,
            blocking_missing=[],
        )
        == "READY"
    )


def test_readiness_blocks_changed_pattern_failure():
    assert (
        readiness_state(
            expected=100,
            ready=99,
            source_expected=100,
            source_ready=80,
            blocking_missing=["new-pattern"],
        )
        == "BLOCKED_CHANGED_PATTERNS"
    )


def test_readiness_blocks_coverage_regression():
    assert (
        readiness_state(
            expected=100,
            ready=70,
            source_expected=100,
            source_ready=80,
            blocking_missing=[],
        )
        == "BLOCKED_COVERAGE_REGRESSION"
    )


def test_readiness_requires_baseline_before_warm_activation():
    assert (
        readiness_state(
            expected=100,
            ready=80,
            source_expected=100,
            source_ready=0,
            blocking_missing=[],
        )
        == "BLOCKED_BASELINE_NOT_READY"
    )

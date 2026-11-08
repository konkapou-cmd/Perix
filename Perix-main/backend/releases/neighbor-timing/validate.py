"""Run the explicit offline suites, preserving the existing baseline checks."""
from pathlib import Path

T = Path(__file__).parent
source = (T / 'perix-sparse-validate.py').read_text(encoding='utf-8')
source = source.replace('perix-sparse-realtime-release', 'perix-neighbor-timing-release')
source = source.replace('perix-sparse-release.py', 'perix-neighbor-release.py')
source = source.replace("tests = ['sparse_realtime_timing'", "tests = ['neighbor_timing', 'mobility_motion_diagnostics', 'sparse_realtime_timing'")
source = source.replace('explicitly uncertain; forward-only algorithm unchanged',
    'replaced by a shared stop-constrained fallback plan; generic limits, no signal observations')
exec(compile(source, str(Path(__file__)), 'exec'))

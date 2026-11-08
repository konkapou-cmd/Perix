"""Byte-exact reproduction of the new candidate from the frozen baseline."""
from pathlib import Path

T = Path(__file__).parent
source = (T / 'perix-sparse-patch-check.py').read_text(encoding='utf-8')
source = source.replace('perix-sparse-realtime-release', 'perix-neighbor-timing-release')
source = source.replace('backend\\releases\\sparse-realtime', 'backend\\releases\\neighbor-timing')
source = source.replace('perix-sparse-release.py', 'perix-neighbor-release.py')
exec(compile(source, str(Path(__file__)), 'exec'))

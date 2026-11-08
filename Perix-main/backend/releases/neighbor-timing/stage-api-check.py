"""Read-only HTTP checks for the neighbour timing candidate."""
from pathlib import Path

T = Path(__file__).parent
source = (T / 'perix-sparse-stage-api.py').read_text(encoding='utf-8')
source = source.replace('perix-sparse-realtime-release', 'perix-neighbor-timing-release')
exec(compile(source, str(Path(__file__)), 'exec'))

"""Repeat pure neighbour tests in a separate production process, without writes."""
from pathlib import Path

T = Path(__file__).parent
source = (T / 'perix-neighbor-runtime-tests.py').read_text(encoding='utf-8')
source = source.replace('result = release.remote(code)', 'result = release.remote(code, production=True)')
source = source.replace('stage-offline-regressions.json', 'production-offline-regressions.json')
exec(compile(source, str(Path(__file__)), 'exec'))

"""Explicit small public API capture for the offline matching trial.

No database, runtime changes, polling loop, SDK or third-party code execution.
Host is fixed; at most four operator-selected Magdeburg platform queries.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import time

import httpx

HOST = 'https://infranode.dev'
MAX_BYTES = 4 * 1024 * 1024
MAX_QUERIES = 4


def capture_one(client, stop_id):
    if not re.fullmatch(r'de:15003:\d+(?::\d*){0,2}', stop_id):
        raise ValueError('Only explicit Magdeburg DELFI stop IDs are permitted')
    url = HOST+'/api/v1/live/magdeburg/transit/departures'
    started = time.monotonic()
    captured = {'url': url, 'query_stop_id': stop_id,
                'requested_at': datetime.now(timezone.utc).isoformat()}
    try:
        with client.stream('GET', url, params={'stop_id': stop_id}) as response:
            captured['http_status'] = response.status_code
            chunks, total = [], 0
            for chunk in response.iter_bytes():
                total += len(chunk)
                if total > MAX_BYTES:
                    raise ValueError('Trial response exceeds 4 MiB')
                chunks.append(chunk)
            body = b''.join(chunks)
            captured.update(http_status=response.status_code, body_sha256=hashlib.sha256(body).hexdigest(),
                response=json.loads(body, parse_constant=reject_constant),
                response_headers={k:v for k,v in response.headers.items() if k.lower() in
                    ('date','age','cache-control','ratelimit-limit','ratelimit-remaining','retry-after')})
    except (httpx.HTTPError, ValueError) as error:
        captured.update(error_type=type(error).__name__, response={'data':None,
            'meta':{'source_status':'capture_failed'}})
    captured.update(captured_at=datetime.now(timezone.utc).isoformat(), elapsed_s=time.monotonic()-started)
    return captured


def reject_constant(value):
    raise ValueError('Invalid JSON numeric constant: '+value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stop-id', action='append', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    ids = list(dict.fromkeys(args.stop_id))
    if len(ids) > MAX_QUERIES or any(not re.fullmatch(r'de:15003:\d+(?::\d*){0,2}', sid) for sid in ids):
        raise ValueError('One to four explicit Magdeburg stops required')
    if args.output.exists():
        raise FileExistsError('Refusing to overwrite a prior capture')
    with httpx.Client(timeout=20, follow_redirects=False,
                      headers={'User-Agent':'PERIX-readonly-source-trial (https://app.perix.eu)'}) as client:
        captures = [capture_one(client, sid) for sid in ids]
    with args.output.open('x', encoding='utf-8') as stream:
        json.dump(captures, stream, indent=2, allow_nan=False)
    print(json.dumps({'output':str(args.output), 'queries':len(captures),
                      'http_statuses':[c.get('http_status') for c in captures], 'production_changed':False}))


if __name__ == '__main__':
    main()

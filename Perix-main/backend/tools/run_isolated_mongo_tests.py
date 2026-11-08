"""Run selected synthetic tests on a new, loopback-only disposable MongoDB.

No production connection, installation, service registration or data deletion.
The caller supplies an already verified local executable and a NEW work folder.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import socket
import subprocess
import sys
import time
import uuid
from pathlib import Path

from pymongo import MongoClient
from pymongo.errors import AutoReconnect, ConnectionFailure


def sha256_file(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def free_loopback_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def start_server(binary, dbpath, logfile):
    port = free_loopback_port()
    process = subprocess.Popen([str(binary), '--bind_ip', '127.0.0.1', '--port', str(port),
                                '--dbpath', str(dbpath), '--logpath', str(logfile), '--quiet'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    deadline = time.monotonic() + 35
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError('disposable MongoDB exited before readiness')
        client = MongoClient(f'mongodb://127.0.0.1:{port}', serverSelectionTimeoutMS=500)
        try:
            status = client.admin.command('serverStatus')
            parsed = client.admin.command('getCmdLineOpts')['parsed']
        except Exception:
            client.close()
            time.sleep(.25)
            continue
        if (int(status['pid']) != process.pid or parsed['net']['bindIp'] != '127.0.0.1'
                or int(parsed['net']['port']) != port
                or Path(parsed['storage']['dbPath']).resolve() != dbpath.resolve()):
            client.close()
            process.terminate(); process.wait(timeout=10)
            raise RuntimeError('server identity or binding mismatch')
        return process, client, port, status
    process.terminate(); process.wait(timeout=10)
    raise RuntimeError('disposable MongoDB readiness timeout')


def stop_owned_server(process, client):
    """Never send shutdown to a different process, even after a port race."""
    try:
        if process.poll() is None:
            try:
                status = client.admin.command('serverStatus')
                if int(status['pid']) != process.pid:
                    raise RuntimeError('refusing shutdown of a different MongoDB process')
                client.admin.command({'shutdown': 1, 'force': True})
            except (AutoReconnect, ConnectionFailure):
                pass  # normal server-side shutdown closes the connection
    finally:
        client.close()
    process.wait(timeout=25)
    if process.returncode != 0:
        raise RuntimeError('disposable MongoDB did not shut down cleanly')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mongod', required=True, type=Path)
    parser.add_argument('--mongod-sha256', required=True)
    parser.add_argument('--workdir', required=True, type=Path, help='New directory; never an existing data folder')
    for name in ('osm-raw', 'osm-audit', 'osm-ways', 'network', 'candidates'):
        parser.add_argument('--' + name, type=Path, help='Optional captured data for isolated OSM builder tests')
    parser.add_argument('--all-osm-patterns', action='store_true',
                        help='Test all captured patterns in the same disposable database; never deploy')
    parser.add_argument('--visual-http', action='store_true',
                        help='Also launch four GET-only loopback Uvicorn fixtures; never hosted services')
    parser.add_argument('--test-timeout-s', type=int, default=None,
                        help='Explicit test timeout (1..1800 seconds); default depends on selected suite')
    parser.add_argument('--backend-root', type=Path,
                        help='Run tests from an exact isolated package instead of this checkout')
    args = parser.parse_args(argv)
    if args.test_timeout_s is not None and not 1 <= args.test_timeout_s <= 1800:
        raise ValueError('test timeout must be between 1 and 1800 seconds')
    evidence = {'PERIX_LOCAL_OSM_RAW': args.osm_raw, 'PERIX_LOCAL_OSM_AUDIT': args.osm_audit,
                'PERIX_LOCAL_OSM_WAYS': args.osm_ways, 'PERIX_LOCAL_NETWORK': args.network,
                'PERIX_LOCAL_CANDIDATES': args.candidates}
    if any(evidence.values()) and not all(evidence.values()):
        raise ValueError('all five offline OSM evidence files must be provided together')
    if args.all_osm_patterns and not all(evidence.values()):
        raise ValueError('all-pattern test requires all five offline OSM evidence files')
    for path in evidence.values():
        if path is not None: path.resolve(strict=True)
    binary = args.mongod.resolve(strict=True)
    if sha256_file(binary) != args.mongod_sha256.lower():
        raise ValueError('MongoDB executable hash mismatch')
    workdir = args.workdir.resolve()
    workdir.mkdir(parents=False, exist_ok=False)
    dbpath = workdir / 'db'; dbpath.mkdir(exist_ok=False)
    logs = [workdir / 'start.log', workdir / 'restart.log']
    report_path = workdir / 'report.json'
    backend = (args.backend_root or Path(__file__).resolve().parents[1]).resolve(strict=True)
    if not (backend/'tests').is_dir() or not (backend/'mobility').is_dir():
        raise ValueError('backend root must contain tests and mobility source')
    process = client = None
    try:
        process, client, port, server = start_server(binary, dbpath, logs[0])
        first_pid = process.pid
        database = 'perix_ci_isolated_' + uuid.uuid4().hex[:12]
        env = {**os.environ, 'MONGO_URL': f'mongodb://127.0.0.1:{port}', 'DB_NAME': database,
               'PERIX_ISOLATED_MONGO_PID': str(process.pid), 'PERIX_ISOLATED_MONGO_DBPATH': str(dbpath),
               'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONIOENCODING': 'utf-8'}
        for key in evidence:
            env.pop(key, None)  # never inherit a caller's unrelated data path
        env.pop('PERIX_LOCAL_OSM_ALL', None)
        cmd = [sys.executable, '-B', '-m', 'pytest', '-p', 'no:cacheprovider',
               'tests/test_mobility_verified_detours.py', 'tests/test_realtime_order_isolated.py',
               'tests/test_osm_rollback_isolated.py', 'tests/test_visual_multiworker_isolated.py']
        if args.visual_http:
            cmd.append('tests/test_visual_http_isolated.py')
        if all(evidence.values()):
            env.update({key: str(path.resolve()) for key, path in evidence.items()})
            if args.all_osm_patterns: env['PERIX_LOCAL_OSM_ALL'] = '1'
            cmd.append('tests/test_local_osm_generation_isolated.py')
        cmd.append('-q')
        try:
            run = subprocess.run(cmd, cwd=backend, env=env, capture_output=True, text=True, encoding='utf-8',
                                  timeout=args.test_timeout_s or (1200 if args.all_osm_patterns else 600 if all(evidence.values()) else 180))
        except subprocess.TimeoutExpired as exc:
            def partial(value):
                return value.decode('utf-8', errors='replace') if isinstance(value, bytes) else (value or '')
            with (workdir / 'pytest-timeout.txt').open('x', encoding='utf-8', newline='\n') as f:
                f.write(partial(exc.stdout) + '\n' + partial(exc.stderr))
            raise RuntimeError(f'isolated pytest timed out; partial output at {workdir / "pytest-timeout.txt"}') from exc
        with (workdir / 'pytest.txt').open('x', encoding='utf-8', newline='\n') as f:
            f.write(run.stdout + '\n' + run.stderr)
        if run.returncode:
            raise RuntimeError(f'isolated pytest failed ({run.returncode}); see {workdir / "pytest.txt"}')
        found = []
        for name in client[database].list_collection_names():
            if name.startswith('order_'):
                row = client[database][name].find_one({'region_id': 'synthetic', 'network_id': 'synthetic',
                                                     'trip_id': 'trip', 'delay_seconds': 59})
                if row: found.append((name, row['feed_timestamp']))
        if len(found) != 1:
            raise RuntimeError('missing or ambiguous multiprocess winner')
        collection, clock = found[0]
        stop_owned_server(process, client); process = client = None
        process, client, restart_port, server2 = start_server(binary, dbpath, logs[1])
        restored = client[database][collection].find_one({'region_id': 'synthetic', 'network_id': 'synthetic', 'trip_id': 'trip'})
        if not restored or restored.get('feed_timestamp') != clock or restored.get('delay_seconds') != 59:
            raise RuntimeError('latest row not retained after disposable server restart')
        archived = list(client[database].bus_network_versions.find(
            {'name': 'synthetic identity test', 'service_date': '2026-11-02'}, {'_id': 0, 'static_input': 1, 'active': 1}))
        if archived != [{'static_input': {'kind': 'GTFS_ARCHIVE', 'sha256': 'c' * 64, 'ingestion': 'DOWNLOAD'},
                         'active': False}]:
            raise RuntimeError('synthetic archive identity missing or changed after restart')
        graph_meta = list(client[database].mobility_osm_graph_meta.find(
            {'region_id': {'$regex': '^synthetic_rollback_'}}, {'_id': 0, 'region_id': 1, 'active_v': 1}))
        if len(graph_meta) != 1:
            raise RuntimeError('missing or ambiguous synthetic rollback graph')
        scope = {'region_id': graph_meta[0]['region_id'], 'graph_v': graph_meta[0]['active_v']}
        way_ids = sorted(d['way_id'] for d in client[database].mobility_osm_ways.find(scope, {'_id': 0, 'way_id': 1}))
        signal_ids = sorted(d['signal_id'] for d in client[database].mobility_osm_signals.find(scope, {'_id': 0, 'signal_id': 1}))
        if way_ids != [11, 12] or signal_ids != [13]:
            raise RuntimeError('restored synthetic graph not retained after restart')
        visual_report = json.loads((workdir / 'visual-multiworker-report.json').read_text(encoding='utf-8'))
        last_visual = [p for p in visual_report['phases'] if p['result'] is not None][-1]
        if not last_visual['parameters']['collection'].startswith('visual_'):
            raise RuntimeError('unexpected synthetic visual collection')
        visual_env = {**env, 'MONGO_URL': f'mongodb://127.0.0.1:{restart_port}',
                      'PERIX_ISOLATED_MONGO_PID': str(process.pid)}
        visual_probe = subprocess.run([sys.executable, '-B', '-c',
            "import sys; sys.path.insert(0, 'tests'); from test_visual_multiworker_isolated import worker; worker(sys.argv[1])",
            json.dumps(last_visual['parameters'])], cwd=backend, env=visual_env,
            capture_output=True, text=True, encoding='utf-8', timeout=45)
        if visual_probe.returncode:
            raise RuntimeError('synthetic visual state restart probe failed')
        restored_visual = json.loads(visual_probe.stdout)
        if len(restored_visual) != 10 or any(s != last_visual['result'] for s in restored_visual):
            raise RuntimeError('synthetic optical anchor changed after database restart')
        result = {'server_version': server['version'], 'first_pid': first_pid, 'restart_pid': process.pid,
                  'pid_and_loopback_verified': True, 'database': database, 'pytest_exit_code': run.returncode,
                  'pytest_summary': run.stdout, 'latest_row_survived_database_restart': True,
                  'synthetic_archive_identity_survived_database_restart': True,
                  'synthetic_graph_restore_survived_database_restart': True,
                  'synthetic_visual_anchor_survived_database_restart': True,
                  'visual_http_test_requested': args.visual_http,
                  'offline_osm_smoke_test_requested': bool(all(evidence.values())),
                  'all_osm_patterns_requested': args.all_osm_patterns,
                  'limits': [('Realtime and closure tests use synthetic data; OSM smoke uses supplied captured public data.'
                              if all(evidence.values()) else 'Synthetic data only.'),
                             'Not the deployed MongoDB version.',
                             'Database restart is not a full app/worker restart, staging deployment, or load test.']}
        with report_path.open('x', encoding='utf-8', newline='\n') as f:
            json.dump(result, f, ensure_ascii=False, indent=2); f.write('\n')
        print(json.dumps({'report': str(report_path), **result}, ensure_ascii=True))
    finally:
        if process is not None:
            if client is not None:
                try: stop_owned_server(process, client)
                except Exception:
                    client.close()
                    if process.poll() is None: process.terminate(); process.wait(timeout=10)
            elif process.poll() is None:
                process.terminate(); process.wait(timeout=10)


if __name__ == '__main__': main()

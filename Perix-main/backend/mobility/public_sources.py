"""Public transit notices and a bounded OSM-derived route-data offer.

No credentials, personal records, traffic/GPS observations or source-clock
mutation. Archive identity is never guessed from the configured provider.
"""
import html
import json
from urllib.parse import urlsplit

from fastapi import APIRouter
from starlette.responses import HTMLResponse, StreamingResponse

from database import db
from mobility.regions import get_active_region

router = APIRouter()
OSM_SOURCES = ('OSM_ROADS', 'OSM_RAIL', 'OSM_ROADS_SEGMENTS', 'OSM_RAIL_SEGMENTS')
EDGE_FIELDS = ('edge_id', 'way_id', 'from_node', 'to_node', 'from_m', 'to_m', 'length_m', 'from_point', 'to_point')
WAY_FIELDS = ('highway', 'railway', 'maxspeed', 'maxspeed_kmh', 'oneway', 'access', 'bus', 'psv',
              'junction', 'lanes', 'surface', 'follows_osm_way', 'layer', 'bridge', 'tunnel')
SIGNAL_FIELDS = ('signal_id', 'signal_instance_id', 'node_id', 'progress_m', 'kinds',
                 'latitude', 'longitude', 'usable_for_motion', 'match_method', 'direction_status')


def public_generation(row):
    geometry = row.get('geometry') or {}
    if row.get('ready') is not True or geometry.get('source') not in OSM_SOURCES:
        return None
    infra = row.get('infrastructure') or {}
    edges = []
    for edge in infra.get('edges') or []:
        clean = {k: edge[k] for k in EDGE_FIELDS if k in edge}
        clean['way'] = {k: v for k, v in (edge.get('way') or {}).items() if k in WAY_FIELDS}
        edges.append(clean)
    return dict(pattern_id=row.get('pattern_id'), mode=row.get('mode'), generation_id=row.get('generation_id'),
        network_version_id=row.get('version_id'),
        osm_snapshot_v=row.get('osm_snapshot_v'), geometry=dict(source=geometry['source'], points=geometry.get('points') or []),
        infrastructure=dict(edges=edges, signals=[{k:s[k] for k in SIGNAL_FIELDS if k in s} for s in infra.get('signals') or []]))


@router.get('/data-sources', response_class=HTMLResponse)
async def data_sources():
    from routes.mobility import _get_active_network
    network = await _get_active_network() or {}
    region = get_active_region()
    static = urlsplit(region.static_gtfs_url).hostname == 'download.gtfs.de'
    realtime = urlsplit(region.realtime_url).hostname == 'realtime.gtfs.de'
    bound = isinstance(network.get('static_input'), dict)
    lines = ['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
        '<title>PERIX transit sources and licences</title><main style="max-width:60rem;margin:2rem auto;padding:1rem;font:16px/1.6 system-ui">',
        '<h1>Transit estimates: sources and licences</h1>',
        '<p>PERIX modelled transit positions are estimates, not measured GPS. ETA zero completes the visual estimate, not an observed arrival. Registered GPS/driver positions, where present, retain separate source labels.</p>',
        '<p>PERIX transformations include dated trip matching, forecast propagation, route reconstruction/snap matching and modelled visual motion. No provider endorsement is implied.</p>',
        '<p>Network: '+html.escape(str(network.get('version_id') or 'unavailable'))+'; service date: '+html.escape(str(network.get('service_date') or 'unknown'))+'.</p>',
        '<h2>Configured feed providers</h2><p>Configuration identifies the provider used by automatic ingestion, not the exact input of an old, manual or QA version.</p><ul>']
    if static:
        lines.append('<li>Schedules: <a href="https://gtfs.de/en/feeds/de_nv/">gtfs.de / DELFI e.V.</a> — <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Archive-supplied credits include DELFI e.V., GTFS.de and OpenStreetMap contributors.</li>')
    if realtime:
        lines.append('<li>Realtime TripUpdates/ServiceAlerts: <a href="https://gtfs.de/en/realtime/">gtfs.de</a> — <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Adapted realtime estimate data is offered under those terms where applicable rights attach; no vehicle GPS is implied.</li>')
    lines.extend(['</ul><p>Static archive identity for this network: '+('version-bound metadata present' if bound else 'unknown / not retroactively assigned')+'.</p>',
        '<h2>OSM-derived routing</h2><p>© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>, <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a>. Reconstructed directed route geometry and mapped infrastructure are modified/derived data, not a physical survey or live signal-phase observation.</p>',
        '<p><a href="osm-derived">Download the active OSM-derived route geometry/infrastructure database (JSON, ODbL)</a>. Unknown/manual/QA sources and private operational/user data are excluded.</p>',
        '<p>These data terms apply to the respective transit datasets, not to user posts, messages, business content or the PERIX application code. Source availability and physical accuracy are not guaranteed.</p></main></html>'])
    return HTMLResponse(''.join(lines), headers={'Cache-Control': 'public, max-age=60'})


@router.get('/osm-derived')
async def osm_derived():
    from routes.mobility import _get_active_network, networks_for_journey_window
    network = await _get_active_network() or {}
    networks = await networks_for_journey_window()
    region = get_active_region()
    scope = dict(region_id=region.region_id, network_id=region.network_id,
                 version_id={'$in':[str(n['version_id']) for n in networks if n.get('version_id')]},
                 ready=True, **{'geometry.source': {'$in': OSM_SOURCES}})
    cursor = db.mobility_pattern_generations.find(scope, {'_id': 0, 'pattern_id': 1, 'mode': 1,
        'version_id':1,'generation_id': 1, 'osm_snapshot_v': 1, 'ready': 1, 'geometry': 1, 'infrastructure': 1}).limit(2000).batch_size(2)
    async def stream():
        meta = dict(licence='ODbL-1.0', licence_url='https://opendatacommons.org/licenses/odbl/1-0/',
            attribution='© OpenStreetMap contributors', source_url='https://www.openstreetmap.org/copyright',
            network_version_id=network.get('version_id'), service_date=network.get('service_date'),
            journey_window_versions=[dict(version_id=n.get('version_id'),service_date=n.get('service_date')) for n in networks],
            transformations='Directed route reconstruction, stop snapping, infrastructure matching; no observed traffic or GPS.',
            scope='OSM-derived geometry/infrastructure only; not user or forecast data.')
        yield json.dumps(meta, ensure_ascii=False)[:-1]+',"patterns":['
        first = True
        try:
            async for row in cursor:
                clean = public_generation(row)
                if clean is not None:
                    yield ('' if first else ',')+json.dumps(clean, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
                    first = False
        finally:
            await cursor.close()
        yield ']}'
    return StreamingResponse(stream(), media_type='application/json', headers={
        'Content-Disposition': 'attachment; filename="perix-osm-derived-routes.json"',
        'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff'})

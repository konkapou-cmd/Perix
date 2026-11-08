"""TEST ONLY local SVG review shell around the actual isolated V2 HTTP fixture."""
from contextlib import asynccontextmanager
import os
from pathlib import Path
from time import time as real_time

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

import visual_http_fixture_app as fixture
from database import db
from mobility.motion.visual_runtime import clear_visual_cache


ROOT = Path(os.environ['PERIX_VISUAL_REVIEW_ROOT']).resolve()


@asynccontextmanager
async def lifespan(app):
    async with fixture.lifespan(app):
        yield


app = FastAPI(lifespan=lifespan)


class Action(BaseModel):
    name: str


@app.get('/review')
async def page():
    return FileResponse(ROOT/'index.html', headers={
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-src 'none'",
        'Cache-Control': 'no-store'})


@app.get('/review/{asset}')
async def asset(asset: str):
    if asset not in ('review.js', 'transitPublication.js'):
        raise HTTPException(404)
    return FileResponse(ROOT/asset, media_type='application/javascript', headers={'Cache-Control': 'no-store'})


@app.get('/review-state')
async def state():
    row = await db.visual_http_control.find_one({'_id': 'fixture'}, {'_id': 0})
    return row


@app.post('/review-action')
async def action(action: Action):
    old = await db.visual_http_control.find_one({'_id': 'fixture'})
    now = old['now_s']+(max(0, real_time()-old['started_epoch']) if old.get('running') else 0)
    update = dict(now_s=now, started_epoch=real_time())
    if action.name == 'play':
        update['running'] = True
    elif action.name == 'pause':
        update['running'] = False
    elif action.name in ('reset', 'approach'):
        update.update(now_s=130 if action.name == 'reset' else 152, duration=45,
                      running=False, canceled=False, hidden=False)
        # A reset is an explicit NEW synthetic journey experiment, not an old
        # source packet. Only this test-only namespace is ever cleared.
        await db.mobility_visual_progress_state.delete_many({'identity.region_id': 'synthetic_http'})
        clear_visual_cache()
    elif action.name == 'delay':
        update['duration'] = max(old['duration']+30, int(now-110)+30)
    elif action.name == 'earlier':
        update['duration'] = max(1, int(now-110)+8)
    elif action.name == 'hidden':
        update['hidden'] = not old.get('hidden', False)
    elif action.name == 'cancel':
        update['canceled'] = not old.get('canceled', False)
    else:
        raise HTTPException(422, 'Unknown synthetic action')
    update['order'] = old['order']+1
    await db.visual_http_control.update_one({'_id': 'fixture'}, {'$set': update})
    await db.mobility_pattern_generations.update_one(
        {'region_id': 'synthetic_http', 'version_id': 'visual-http-v'},
        {'$set': {'ready': not update.get('hidden', old.get('hidden', False))}})
    return {'ok': True, 'action': action.name}


app.mount('/', fixture.app)

import { authorizePreview, sampleAuthorizedPreview } from './transitPublication.js';

let state = {}, vehicle = null, active = null, board = [], line = null, busy = false;
const evidence = { samples: [], actions: [], errors: [], requests: 0 };
window.visualReview = evidence;
function project(lat, lon) { return { x: 80+(lon-11.6)/0.003*600, y: 320-(lat-52.1)/0.002*240 }; }
function pointAtProgress(points, progress) {
  let distance = 0;
  for (let i = 0; i+1 < points.length; i++) {
    const a=points[i], b=points[i+1], rad=Math.PI/180;
    const h=Math.sin((b.latitude-a.latitude)*rad/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin((b.longitude-a.longitude)*rad/2)**2;
    const length=6371000*2*Math.asin(Math.min(1, Math.sqrt(h)));
    if (progress <= distance+length || i+2===points.length) {
      const ratio=Math.max(0, Math.min(1, (progress-distance)/length));
      return project(a.latitude+(b.latitude-a.latitude)*ratio, a.longitude+(b.longitude-a.longitude)*ratio);
    }
    distance+=length;
  }
  return null;
}
async function get(path) {
  const start=Date.now(); const response=await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw Error(`${path}: HTTP ${response.status}`);
  const data=await response.json(); evidence.requests++;
  return { data, start, end: Date.now() };
}
async function refresh() {
  if (busy) return;
  busy=true;
  try {
    const [fleet, arrivals, map, control]=await Promise.all([
      get('/api/mobility/v2/vehicles'), get('/api/mobility/v2/stops/B/arrivals?platform_id=B'),
      get('/api/mobility/v2/map'), get('/review-state'),
    ]);
    state=control.data; vehicle=fleet.data[0] || null; board=arrivals.data;
    line=map.data.lines.find(l=>l.pattern_id===vehicle?.pattern_id && l.network_version_id===vehicle?.network_version_id && l.service_date===vehicle?.service_date && l.valid);
    active=null;
    if (vehicle?.motion?.preview && line) {
      const preview={ ...vehicle.motion.preview, client_request_at_ms:fleet.start, client_received_at_ms:fleet.end };
      active=authorizePreview(preview, { estimated:vehicle.estimated, mode:vehicle.mode,
        journeyId:vehicle.trip_instance_id, patternId:vehicle.pattern_id, planRevision:vehicle.motion_plan_revision,
        progressM:vehicle.progress_m, pathLengthM:preview.stop_progress_m,
        geometryFingerprint:line.approach_geometry_fingerprint, nextTimelineIndex:vehicle.next_timeline_index,
        distanceToNextStopM:vehicle.distance_to_next_stop_m, nextStopEtaSeconds:vehicle.next_stop_eta_seconds },
        Date.now(), performance.now());
    }
    evidence.latest={ state:{...state}, vehicle, board, previewAuthorized:!!active, responseRttMs:fleet.end-fleet.start };
    document.getElementById('status').textContent=state.canceled ? 'Ακυρωμένο συνθετικό δρομολόγιο' : state.hidden ? 'Άγνωστη γεωμετρία: πινέζα κρυμμένη, χρόνος στάσης διαθέσιμος' : state.running ? 'Οπτική κίνηση σε εξέλιξη' : 'Παύση · ίδιος χρόνος πηγής για πινέζα και πίνακα';
  } catch (error) {
    evidence.errors.push(String(error)); active=null; vehicle=null;
    document.getElementById('status').textContent=String(error);
  } finally { busy=false; }
}
for (const button of document.querySelectorAll('button[data-action]')) {
  button.addEventListener('click', async () => {
    const action=button.dataset.action;
    const response=await fetch('/review-action', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:action}) });
    if (!response.ok) { evidence.errors.push(`Action ${action} failed`); return; }
    evidence.actions.push({action, at:Date.now()});
    await refresh();
  });
}
function draw() {
  let p=vehicle?.progress_m;
  let eta=board[0]?.eta_seconds;
  if (active && state.running) {
    const sample=sampleAuthorizedPreview(active, performance.now());
    if (sample) p=sample.progressM;
    const server=active.serverMs+performance.now()-active.monotonicMs;
    eta=Math.max(0, Math.ceil((active.preview.effective_arrival_at_ms-server)/1000));
  }
  const point=vehicle && line && Number.isFinite(p) ? pointAtProgress(line.points,p) : null;
  for (let i=0;i<2;i++) {
    const marker=document.getElementById(`pin${i}`);
    marker.style.display=point ? '' : 'none';
    if (point) marker.setAttribute('transform',`translate(${point.x},${point.y})`);
    document.getElementById(`board${i}`).textContent=state.canceled ? 'Δεν υπάρχει δρομολόγιο' : board.length ? `Στάση Β · Εκτίμηση: ${eta} s` : 'Χωρίς διαθέσιμη πρόβλεψη';
  }
  evidence.frame={ progress_m:p??null, eta_seconds:eta??null, markerVisible:!!point, point,
    previewAuthorized:!!active, observedArrival:false, running:!!state.running };
  document.getElementById('diagnostics').textContent=JSON.stringify({ ...evidence.frame,
    sourceOrder:state.order, revision:vehicle?.motion_plan_revision, apiFleetETA:vehicle?.next_stop_eta_seconds,
    apiBoardETA:board[0]?.eta_seconds, sourceTimingBasis:board[0]?.timing_evidence?.timing_basis,
    errors:evidence.errors, note:'SYNTHETIC · VISUAL ESTIMATE · NOT GPS' },null,2);
  requestAnimationFrame(draw);
}
await refresh(); requestAnimationFrame(draw); setInterval(refresh,1000);

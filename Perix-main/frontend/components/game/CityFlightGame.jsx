import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createFlightState, stepFlight, flightCamera, changeFlightSpeed, flightTravelLevel, flightSpeedLimit, FLIGHT_RULES } from '../../lib/city/flightSimulation';
import { createFlightModel, disposeFlightScene } from './flightModel';
import { flightDockedView, flightChasePose, flightAircraftViewScale, FLIGHT_TAIL_ANCHOR } from '../../lib/city/flightChaseCamera';
import { isFlightKey, flightSpeedKey, flightHeldKeys } from '../../lib/city/flightControls';
import FlightJoystick from './FlightJoystick';
import { Asset } from 'expo-asset';
import { ALL_LANDMARKS, landmarkImageSource } from '../../lib/city/landmarks';
import { createFlightBuildings, DEFAULT_FLIGHT_BUILDINGS, withFlightBuildingZoomPoint, flightBuildingRegionSettings, withFlightBuildingRegionSettings } from '../../lib/city/flightLandmarks';
import { flightCalibrationView, flightCalibrationAircraft, flightCalibrationRegion, FLIGHT_CALIBRATION_REGIONS } from '../../lib/city/flightCalibration';
import FlightCalibrationPanel from './FlightCalibrationPanel';
import { useTranslation } from 'react-i18next';

let mapsLoading = null;
function loadFlightMaps(apiKey) {
  if (window.google?.maps?.Map) return Promise.resolve(window.google);
  if (mapsLoading) return mapsLoading;
  mapsLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.onload = () => window.google?.maps?.Map ? resolve(window.google) : reject(Error('Maps unavailable'));
    script.onerror = () => reject(Error('Maps load failed'));
    document.head.appendChild(script);
  }).catch(error => { mapsLoading = null; throw error; });
  return mapsLoading;
}

/** Separate, disposable flight map. One input origin; no app location writes. */
export default function CityFlightGame({ apiKey, mapId, startPoint, initialZoom = 17, onExit, onLandscape, onFullscreen, orientationNotice='', onDismissOrientationNotice, showDeveloperTools=false }) {
  const {t}=useTranslation('flight');
  const mapDiv = useRef(null);
  const aircraftCanvas = useRef(null);
  const altitudeLever = useRef(null);
  const input = useRef({ climb: 0, turn: 0, throttle: 0 });
  const stickTurns = useRef({ left: 0, right: 0 });
  const keys = useRef(new Set());
  const speedDelta = useRef(0);
  const [lever, setLever] = useState(0);
  const [resetToken, setResetToken] = useState(0);
  const [hud, setHud] = useState({ altitude: FLIGHT_RULES.startAltitude, distance: 0,
    tempo: flightTravelLevel(FLIGHT_RULES.cruiseMps).toFixed(1), targetTempo: flightTravelLevel(FLIGHT_RULES.cruiseMps).toFixed(1), tempoMax: 10,
    zoom:initialZoom,nearestWidth:0,nearestDistance:0,buildings:{count:0,loaded:0,failed:0,pending:0} });
  const [status, setStatus] = useState('status.loading');
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const updatePaused = value => { pausedRef.current = value; setPaused(value); };
  // Callbacks stay current without rebuilding the map on a route render.
  const exitRef = useRef(onExit); exitRef.current = onExit;
  const [allBuildingSettings,setAllBuildingSettings]=useState({...DEFAULT_FLIGHT_BUILDINGS});
  const [showBuildingSettings,setShowBuildingSettings]=useState(false);
  const [calibrationWidth,setCalibrationWidth]=useState(150);
  const buildingsConfig=useRef(allBuildingSettings);buildingsConfig.current=allBuildingSettings;
  const buildingsRedraw=useRef(null);
  const buildingsRetry=useRef(null);
  const [buildingLayerError,setBuildingLayerError]=useState(false);
  const [calibrating,setCalibrating]=useState(false);
  const [calibrationCollapsed,setCalibrationCollapsed]=useState(false);
  const [surveyView,setSurveyView]=useState({zoom:initialZoom,tilt:60,heading:0,altitude:25});
  const calibrationRef=useRef(false),calibrationRuntime=useRef(null);
  const initialRegion=flightCalibrationRegion({lat:startPoint.latitude,lng:startPoint.longitude});
  const [calibrationRegion,setCalibrationRegion]=useState(initialRegion);
  const editedRegion=calibrating?calibrationRegion:(hud.region??initialRegion);
  const buildingSettings=flightBuildingRegionSettings(allBuildingSettings,editedRegion);
  const setBuildingSettings=value=>setAllBuildingSettings(current=>{
    const profile=flightBuildingRegionSettings(current,editedRegion);
    return withFlightBuildingRegionSettings(current,editedRegion,typeof value==='function'?value(profile):value);
  });
  useEffect(() => {
    let stopped = false, map, overlay, scene, camera, renderer, model,buildings;
    let lastBuildings=-Infinity,lastBuildingsConfig=null,buildingInfo=null,calibrationIdle;
    let state = createFlightState(startPoint);
    let lastTime = null, lastHud = 0, rendered = false, modelReady = false, renderWidth = 0, renderHeight = 0, framedModel = null, framedPose = '';
    const clearInput = () => {
      input.current = { climb: 0, turn: 0, throttle: 0 }; keys.current.clear(); speedDelta.current = 0;
      stickTurns.current = { left: 0, right: 0 };
      if (!stopped) { setLever(0); setResetToken(value=>value+1); }
    };
    const pauseOnBlur = () => { clearInput(); updatePaused(true); lastTime = null; };
    const aircraftContextLost = event => {
      event.preventDefault(); pauseOnBlur();
      setStatus('status.interrupted');
    };
    const aircraftContextRestored = () => { lastTime = null; overlay?.requestRedraw(); };
    const onVisibility = () => { if (document.hidden) pauseOnBlur(); };
    const onKey = (event, down) => {
      if(calibrationRef.current)return;
      const target = event.target;
      if (target?.isContentEditable || ['TEXTAREA', 'SELECT'].includes(target?.tagName)
        || (target?.tagName === 'INPUT' && target.type !== 'range')) return;
      if (!isFlightKey(event.code)) return;
      event.preventDefault();
      if (down && !keys.current.has(event.code) && !event.repeat) {
        speedDelta.current += flightSpeedKey(event.code) * FLIGHT_RULES.speedClickMps;
      }
      if (down) keys.current.add(event.code); else keys.current.delete(event.code);
    };
    const keyDown = event => onKey(event, true), keyUp = event => onKey(event, false);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', pauseOnBlur);
    document.addEventListener('visibilitychange', onVisibility);
    const canvas = aircraftCanvas.current;
    canvas?.addEventListener?.('webglcontextlost', aircraftContextLost);
    canvas?.addEventListener?.('webglcontextrestored', aircraftContextRestored);
    loadFlightMaps(apiKey).then(google => {
      if (stopped || !mapDiv.current) return;
      map = new google.maps.Map(mapDiv.current, {
        ...flightCamera(state, initialZoom), mapId, mapTypeId: 'roadmap',
        disableDefaultUI: true, gestureHandling: 'none', keyboardShortcuts: false,
      });
      overlay = new google.maps.WebGLOverlayView();
      const readSurvey=()=>flightCalibrationView({zoom:map.getZoom?.()??initialZoom,tilt:map.getTilt?.()??60,
        heading:map.getHeading?.()??state.heading,altitude:calibrationRef.current?.altitude??state.altitude});
      const redrawSurvey=()=>{lastTime=null;lastHud=-Infinity;lastBuildings=-Infinity;overlay?.requestRedraw();};
      calibrationIdle=map.addListener?.('idle',()=>{
        if(!calibrationRef.current||stopped)return;
        const view=readSurvey();calibrationRef.current=view;setSurveyView(view);
        setCalibrationRegion(flightCalibrationRegion(map.getCenter?.()?.toJSON?.()));redrawSurvey();
      });
      let savedFlightView;
      calibrationRuntime.current={
        enter(){
          savedFlightView={...flightCamera(state,initialZoom,map.getTilt?.()),zoom:map.getZoom?.()??initialZoom,
            heading:map.getHeading?.()??state.heading,tilt:map.getTilt?.()??60};
          const view=readSurvey();calibrationRef.current=view;clearInput();updatePaused(true);
          setCalibrationRegion(flightCalibrationRegion(map.getCenter?.()?.toJSON?.()??{lat:state.latitude,lng:state.longitude}));
          map.setOptions?.({gestureHandling:'greedy',headingInteractionEnabled:true,tiltInteractionEnabled:true});redrawSurvey();return view;
        },
        change(value){
          if(!calibrationRef.current)return;
          const view=flightCalibrationView(value);calibrationRef.current=view;setSurveyView(view);
          map.moveCamera({zoom:view.zoom,heading:view.heading,tilt:view.tilt});redrawSurvey();
        },
        visit(region){
          const destination=FLIGHT_CALIBRATION_REGIONS.find(item=>item.id===region);
          if(!calibrationRef.current||!destination)return;
          const view={zoom:18,heading:0,tilt:67,altitude:25};calibrationRef.current=view;
          setSurveyView(view);setCalibrationRegion(destination.id);
          map.moveCamera({center:destination.center,zoom:view.zoom,heading:view.heading,tilt:view.tilt});redrawSurvey();
        },
        reset(){
          if(!calibrationRef.current)return;
          map.moveCamera(savedFlightView);calibrationRef.current={...readSurvey(),altitude:state.altitude};
          setSurveyView(calibrationRef.current);setCalibrationRegion(flightCalibrationRegion(savedFlightView.center));redrawSurvey();
        },
        exit(){
          calibrationRef.current=null;clearInput();lastTime=null;updatePaused(true);
          map.setOptions?.({gestureHandling:'none',headingInteractionEnabled:false,tiltInteractionEnabled:false});
          if(savedFlightView)map.moveCamera(savedFlightView);redrawSurvey();
        },
        resize(){google.maps.event?.trigger?.(map,'resize');redrawSurvey();},
      };
      let buildingsLoading=false;
      const loadBuildings=()=>{
        if(stopped||buildingsLoading)return;
        if(buildings){buildings.retryFailed?.();return;}
        buildingsLoading=true;
        createFlightBuildings(google,map,{points:ALL_LANDMARKS,
          image:id=>{const source=landmarkImageSource(id);return typeof source==='string'?source:Asset.fromModule(source).uri;},
          onChange:()=>{if(!stopped){lastBuildings=-Infinity;lastHud=-Infinity;overlay?.requestRedraw();}},
        }).then(layer=>{
          buildingsLoading=false;if(stopped){layer.dispose();return;}
          buildings=layer;setBuildingLayerError(false);lastBuildings=-Infinity;lastHud=-Infinity;overlay?.requestRedraw();
        }).catch(error=>{
          buildingsLoading=false;if(!stopped){setBuildingLayerError(true);console.warn('[PerixFlight] 2D buildings unavailable',error);}
        });
      };
      buildingsRetry.current=loadBuildings;loadBuildings();
      overlay.onAdd = () => {
        scene = new THREE.Scene();
        // Y-up aircraft view, following Maps' actual pitch-dependent tilt.
        camera = new THREE.PerspectiveCamera();
        scene.add(new THREE.HemisphereLight(0xe4f6ff, 0xffe6bc, 2.4));
        scene.add(new THREE.AmbientLight(0xffffff, 1.2));
        const sun = new THREE.DirectionalLight(0xfff5df, 3);
        sun.position.set(-6, 12, -8); scene.add(sun);
        model = createFlightModel(); model.plane.visible = false; scene.add(model.plane);
        import('./perixAircraft').then(module => module.loadPerixAircraft()).then(aircraft => {
          if (stopped) { aircraft.animation?.dispose(); disposeFlightScene(aircraft.plane, null); return; }
          scene.remove(model.plane); disposeFlightScene(model.plane, null);
          model = aircraft; scene.add(model.plane); modelReady = true;
          setStatus('status.ready');
          lastTime = null; overlay?.requestRedraw();
        }).catch(error => {
          if (stopped) return;
          console.error('[PerixFlight] aircraft failed to load', error);
          setStatus('status.modelFailed');
          pauseOnBlur();
        });
      };
      overlay.onContextRestored = () => {
        if (stopped) return;
        try {
          renderer?.dispose();
          // A shared Google WebGL context cannot guarantee painting above its
          // later road/label passes. Own canvas + CSS stacking guarantees it.
          renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
          renderer.setClearColor(0x000000, 0);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
          renderWidth = 0; renderHeight = 0; framedModel = null;
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.05;
          overlay.requestRedraw();
        } catch (error) {
          console.error('[PerixFlight] WebGL unavailable', error);
          setStatus('status.webglUnavailable');
        }
      };
      overlay.onContextLost = () => { renderer?.dispose(); renderer = null; lastTime = null; };
      overlay.onRemove = () => { disposeFlightScene(scene, renderer); renderer = null; };
      overlay.onDraw = () => {
        if (stopped || !renderer || !scene || !model) return;
          const now = performance.now();
        const dt = lastTime === null ? 0 : (now - lastTime) / 1000;
          lastTime = now;
          if(buildings&&(now-lastBuildings>=120||lastBuildingsConfig!==buildingsConfig.current)){
            const evaluationAircraft=calibrationRef.current
              ?flightCalibrationAircraft(state,map.getCenter?.()?.toJSON?.(),calibrationRef.current.altitude):state;
            buildingInfo=buildings.update(evaluationAircraft,map.getZoom?.()??flightCamera(state,initialZoom).zoom,buildingsConfig.current);
            lastBuildings=now;lastBuildingsConfig=buildingsConfig.current;
          }
        try {
          const keyboard = flightHeldKeys(keys.current);
          if (speedDelta.current&&!calibrationRef.current) { state = changeFlightSpeed(state, speedDelta.current); speedDelta.current = 0; }
          if (modelReady && !pausedRef.current && !calibrationRef.current && !document.hidden) {
            state = stepFlight(state, {
              climb: input.current.climb + keyboard.climb,
              turn: Math.max(-1, Math.min(1, input.current.turn + keyboard.turn + stickTurns.current.left + stickTurns.current.right)),
              throttle: input.current.throttle,
            }, dt);
             model.propeller.rotation.z += dt * (24 + state.speedMps);
             model.animation?.update(dt, -state.bank / FLIGHT_RULES.maxBank, state.pitch / FLIGHT_RULES.maxPitch);
            map.moveCamera(flightCamera(state, initialZoom, map.getTilt?.()));
          }
          // Heading already rotates the city. In the aircraft-local chase
          // frame show bank and a little yaw into the turn, never double yaw.
          const pose = flightChasePose(state.pitch, state.bank);
          // Maps can clamp requested tilt at this zoom/on this device. Match
          // the accepted angle instead of pitching a separate fake horizon.
          const actualTilt = map.getTilt?.();
          const viewTilt = Number.isFinite(actualTilt) ? actualTilt : flightCamera(state, initialZoom).tilt;
          model.plane.rotation.set(pose.pitch, pose.yaw, pose.bank, 'YXZ');
          const width = Math.max(1, canvas?.clientWidth || mapDiv.current?.clientWidth || 1);
          const height = Math.max(1, canvas?.clientHeight || mapDiv.current?.clientHeight || 1);
          const wingspan = model.wingspan || 10.6;
          const layoutChanged = width !== renderWidth || height !== renderHeight || model !== framedModel;
          const evaluationAltitude=calibrationRef.current?.altitude??state.altitude;
          const aircraftScale = flightAircraftViewScale(evaluationAltitude);
          const poseKey = `${pose.pitch.toFixed(3)}:${pose.bank.toFixed(3)}:${viewTilt.toFixed(3)}:${aircraftScale.toFixed(3)}`;
          if (layoutChanged || framedPose !== poseKey) {
            if (layoutChanged) renderer.setSize(width, height, false);
            renderWidth = width; renderHeight = height; framedPose = poseKey;
            framedModel = model;
            const view = flightDockedView(width, height, wingspan, pose,
              model.framingPoints || [], model.tailAnchor || FLIGHT_TAIL_ANCHOR, viewTilt, evaluationAltitude);
            camera.fov = view.fov; camera.aspect = view.aspect; camera.near = view.near; camera.far = view.far;
            camera.position.set(view.position.x, view.position.y, view.position.z);
            camera.up.set(view.up.x, view.up.y, view.up.z);
            camera.lookAt(view.target.x, view.target.y, view.target.z);
            camera.setViewOffset(width, height, 0, view.verticalOffsetY, width, height);
            camera.updateProjectionMatrix();
            camera.updateMatrixWorld(true);
            // Both the aircraft's neutral tail line and the stationary lever
            // now dock at the OLD bottom-center control position.
            if (layoutChanged && altitudeLever.current?.style) {
              altitudeLever.current.style.setProperty('--perix-tail-x', `${view.dock.left}px`);
              altitudeLever.current.style.setProperty('--perix-tail-y', `${view.dock.top}px`);
              altitudeLever.current.style.setProperty('--perix-lever-height', `${view.dock.leverHeight}px`);
            }
          }
          renderer.render(scene, camera);
          if (!rendered && modelReady) { rendered = true; setStatus('status.ready'); }
          if (now - lastHud >= 150) {
            lastHud = now; setHud({ altitude: Math.round(state.altitude), distance: Math.round(state.distanceM),
              tempo: flightTravelLevel(state.speedMps).toFixed(1), targetTempo: flightTravelLevel(state.targetSpeedMps).toFixed(1),
              tempoMax: Number(flightTravelLevel(flightSpeedLimit(state)).toFixed(1)),
              zoom:Number((map.getZoom?.()??flightCamera(state,initialZoom).zoom).toFixed(2)),
              tilt:viewTilt,
              region:flightCalibrationRegion({lat:state.latitude,lng:state.longitude}),
              buildings:buildingInfo?{count:buildingInfo.count,loaded:buildingInfo.loaded,failed:buildingInfo.failed,pending:buildingInfo.pending}:{count:0,loaded:0,failed:0,pending:0},
              nearestWidth:buildingInfo?.nearest?.width||0,nearestDistance:buildingInfo?.nearest?.distance||0 });
          }
          if (modelReady && !pausedRef.current && !calibrationRef.current && !document.hidden) overlay.requestRedraw();
        } catch (error) {
          pauseOnBlur();
          console.error('[PerixFlight] rendering failed', error);
          setStatus('status.stopped');
        } finally { renderer?.resetState(); }
      };
      // Re-render when Resume is tapped without keeping a background loop.
      const resume = () => { lastTime = null; overlay?.requestRedraw(); };
      buildingsRedraw.current=()=>{lastBuildings=-Infinity;lastHud=-Infinity;overlay?.requestRedraw();};
      resumeRef.current = resume;
      overlay.setMap(map);
    }).catch(error => {
      if (stopped) return;
      console.error('[PerixFlight] initialization failed', error);
      setStatus('status.mapFailed');
    });
    return () => {
      stopped = true; clearInput(); resumeRef.current = null;
      calibrationRuntime.current=null;calibrationRef.current=null;calibrationIdle?.remove();
      buildingsRedraw.current=null;buildingsRetry.current=null;buildings?.dispose();
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', pauseOnBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas?.removeEventListener?.('webglcontextlost', aircraftContextLost);
      canvas?.removeEventListener?.('webglcontextrestored', aircraftContextRestored);
       overlay?.setMap(null);
       model?.animation?.dispose();
      disposeFlightScene(scene, renderer); renderer = null;
      if (map) window.google?.maps?.event?.clearInstanceListeners(map);
    };
  }, [apiKey, mapId, startPoint, initialZoom]);
  useEffect(()=>{buildingsRedraw.current?.();},[allBuildingSettings]);
  useEffect(()=>{calibrationRuntime.current?.resize();},[calibrating,calibrationCollapsed]);
  const resumeRef = useRef(null);
  const togglePause = () => {
    if(calibrationRef.current)return;
    const next = !pausedRef.current; updatePaused(next);
    input.current = { climb: 0, turn: 0, throttle: 0 }; keys.current.clear();
    stickTurns.current = { left: 0, right: 0 };
    setLever(0); setResetToken(value=>value+1);
    resumeRef.current?.();
  };
  const pointer = (axis, value) => ({
    onPointerDown: event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); input.current[axis] = value; },
    onPointerUp: () => { input.current[axis] = 0; },
    onPointerCancel: () => { input.current[axis] = 0; },
    onLostPointerCapture: () => { input.current[axis] = 0; },
  });
  const accelerate = direction => { speedDelta.current += direction * FLIGHT_RULES.speedClickMps; resumeRef.current?.(); };
  const resetLever = () => { input.current.climb = 0; setLever(0); };
  const openCalibration=()=>{
    const view=calibrationRuntime.current?.enter();if(!view)return;
    setSurveyView(view);setCalibrating(true);setCalibrationCollapsed(false);setShowBuildingSettings(false);
  };
  const surveyDock=calibrationCollapsed?'min(148px,48vw)':'min(320px,48vw)';
  const surveyScene=calibrating?{right:surveyDock,width:`calc(100% - ${surveyDock})`}:{};
  return <div data-testid="flight-game" data-perix-no-text-scale style={{...styles.viewport,touchAction:calibrating?'auto':'none'}}>
    <style>{`.perix-flight-touch-controls{display:none}@media(pointer:coarse),(max-width:1023px){.perix-flight-desktop-controls{display:none!important}.perix-flight-touch-controls{display:block}}@media(max-height:440px){.perix-flight-hint{display:none}} .perix-flight-control:focus-visible{outline:3px solid #ffc96a;outline-offset:3px} .perix-flight-control:active{transform:translateY(2px);filter:brightness(1.2)}`}</style>
    <div ref={mapDiv} style={{...styles.map,...surveyScene}} />
    <canvas ref={aircraftCanvas} data-testid="flight-aircraft-layer" aria-hidden="true" style={{...styles.aircraftLayer,...surveyScene}} />
    {showDeveloperTools&&calibrating&&<FlightCalibrationPanel view={surveyView} actual={{...hud,tilt:hud.tilt??surveyView.tilt}}
      buildingLayerError={buildingLayerError} onRetryBuildings={()=>buildingsRetry.current?.()}
      region={calibrationRegion} onRegion={region=>calibrationRuntime.current?.visit(region)}
      settings={buildingSettings} onSettings={setBuildingSettings} onView={value=>calibrationRuntime.current?.change(value)}
      onResetView={()=>calibrationRuntime.current?.reset()} collapsed={calibrationCollapsed} onCollapse={()=>setCalibrationCollapsed(v=>!v)}
      onClose={()=>{calibrationRuntime.current?.exit();setCalibrating(false);}}/>}
    {!calibrating&&<>
    {!showDeveloperTools&&<button aria-label={t('aria.back')} onClick={()=>exitRef.current?.()} style={{...styles.button,position:'absolute',top:10,left:12,zIndex:5}}>×</button>}
    {!showDeveloperTools&&['status.modelFailed','status.webglUnavailable','status.mapFailed'].includes(status)&&<div data-testid="flight-error-indicator" role="alert" aria-label={t(status)} style={{position:'absolute',top:12,right:14,zIndex:5,color:'#fff',fontSize:24,pointerEvents:'none'}}><span aria-hidden="true">⚠</span></div>}
    {showDeveloperTools&&<div style={styles.top}>
      <button aria-label={t('aria.back')} onClick={() => exitRef.current?.()} style={styles.button}>← {t('back')}</button>
      <div style={styles.status}>
        <div data-testid="flight-building-load-status">{t('loadSummary',{loaded:hud.buildings.loaded??0,count:hud.buildings.count??0,pending:hud.buildings.pending??0,failed:hud.buildings.failed??0})}</div>
        {(buildingLayerError||hud.buildings.failed>0)&&<button aria-label={t('aria.retry')} style={styles.button} onClick={()=>buildingsRetry.current?.()}>{t('actions.retry')}</button>}
      </div>
      <button aria-label={t(paused?'aria.resume':'aria.pause')} aria-pressed={paused} onClick={togglePause} style={styles.button}>{paused ? `▶ ${t('actions.resume')}` : `Ⅱ ${t('actions.pause')}`}</button>
      <button aria-label={t('aria.landscape')} onClick={() => onLandscape?.()} style={styles.button}>↻ {t('actions.landscape')}</button>
      <button aria-label={t('aria.fullscreen')} onClick={() => onFullscreen?.()} style={styles.button}>⛶ {t('actions.fullscreen')}</button>
      <button aria-label={t('aria.settings')} aria-expanded={showBuildingSettings} onClick={()=>setShowBuildingSettings(v=>!v)} style={styles.button}>2D</button>
      <button aria-label={t('aria.calibrate')} onClick={openCalibration} style={styles.button}>{t('actions.calibrate')}</button>
    {!!orientationNotice&&<div role="status" data-testid="flight-orientation-notice" style={styles.orientationNotice}>
      <span>{orientationNotice}</span><button aria-label={t('aria.dismiss')} onClick={()=>onDismissOrientationNotice?.()} style={styles.button}>×</button>
    </div>}
    </div>}
    {showDeveloperTools&&showBuildingSettings&&<div data-testid="flight-building-settings" style={styles.buildingPanel}
      onKeyDown={event=>event.stopPropagation()} onKeyUp={event=>event.stopPropagation()}>
      <strong>{t('panel.sizeAtZoom',{zoom:hud.zoom.toFixed(2)})}</strong>
      <div style={{margin:'6px 0'}}>{t('nearest',{width:hud.nearestWidth.toFixed(1),distance:Math.round(hud.nearestDistance)})}</div>
      <label style={styles.buildingRow}><input type="checkbox" checked={buildingSettings.enabled}
        onChange={e=>setBuildingSettings(s=>({...s,enabled:e.target.checked}))}/> {t('panel.enabled')}</label>
      <label style={styles.buildingRow}>{t('panel.scale')} · {Math.round(buildingSettings.scale*100)}%
        <input aria-label={t('aria.scale')} type="range" min="10" max="2000" step="5" value={buildingSettings.scale*100}
          onChange={e=>setBuildingSettings(s=>({...s,scale:Number(e.target.value)/100}))}/></label>
      <label style={styles.buildingRow}>{t('panel.range')} · {(buildingSettings.maxDistanceM/1000).toFixed(1)} km
        <input aria-label={t('aria.distance')} type="range" min="0.25" max="200" step="0.25" value={buildingSettings.maxDistanceM/1000}
          onChange={e=>setBuildingSettings(s=>({...s,maxDistanceM:Number(e.target.value)*1000}))}/></label>
      <label style={styles.buildingRow}>{t('panel.maxWidth')} · {buildingSettings.maxWidth} px
        <input aria-label={t('aria.maxWidth')} type="range" min="20" max="4096" step="1" value={buildingSettings.maxWidth}
          onChange={e=>setBuildingSettings(s=>({...s,maxWidth:Number(e.target.value)}))}/></label>
      <label style={styles.buildingRow}>Zoom {hud.zoom.toFixed(2)} → px
        <input aria-label={t('aria.calibrationWidth')} type="number" min="2" max="4096" step="0.1" value={calibrationWidth} style={{width:80}}
          onChange={e=>setCalibrationWidth(Number(e.target.value))}/></label>
      <button style={{...styles.button,maxWidth:'100%'}} onClick={()=>setBuildingSettings(s=>withFlightBuildingZoomPoint(s,hud.zoom,calibrationWidth))}>{t('actions.save')}</button>
      {(buildingSettings.zoomPoints||[]).map(([z,px])=><div key={z}>{z.toFixed(2)} → {px.toFixed(1)} px</div>)}
      {!!buildingSettings.zoomPoints?.length&&<button style={{...styles.button,maxWidth:'100%',marginTop:6}}
        onClick={()=>setBuildingSettings(s=>({...s,zoomPoints:undefined}))}>{t('actions.reset')}</button>}
      <p style={{fontSize:10,marginBottom:0}}>{t('panel.quickHelp')}</p>
    </div>}
    {showDeveloperTools&&<div style={styles.footer}>
      <strong data-testid="flight-telemetry" style={styles.footerText}>{t('telemetry',{altitude:hud.altitude,tempo:hud.tempo,max:hud.tempoMax,target:hud.targetTempo})}</strong>
      <span role="status" data-testid="flight-status" style={styles.footerText}>{t(status)}</span>
    </div>}
    {paused && <div style={styles.pauseOverlay}><button aria-label={t('aria.resume')} onClick={togglePause} style={styles.button}>▶ {showDeveloperTools?t('actions.resume'):''}</button></div>}
    {showDeveloperTools&&<div className="perix-flight-hint" style={styles.hint}>{t('controls.hint')}</div>}
    <div className="perix-flight-desktop-controls" style={{ ...styles.controls, left: 'max(16px, env(safe-area-inset-left))' }}>
      <button className="perix-flight-control" aria-label={t('aria.accelerate')} aria-keyshortcuts="W" onClick={() => accelerate(1)} style={styles.control}><span style={styles.controlIcon}>{showDeveloperTools?'W':'+'}</span>{showDeveloperTools&&<small style={styles.controlLabel}>{t('actions.speedUp')}</small>}</button>
      <button className="perix-flight-control" aria-label={t('aria.decelerate')} aria-keyshortcuts="S" onClick={() => accelerate(-1)} style={styles.control}><span style={styles.controlIcon}>{showDeveloperTools?'S':'−'}</span>{showDeveloperTools&&<small style={styles.controlLabel}>{t('actions.speedDown')}</small>}</button>
    </div>
    <div className="perix-flight-desktop-controls" ref={altitudeLever} style={styles.leverBase} data-testid="flight-altitude-lever">
      <label htmlFor="flight-altitude" style={styles.leverLabel}>↓{showDeveloperTools?` · ${t('actions.noseUp')}`:''}</label>
      <input id="flight-altitude" aria-label={t('aria.pitch')} type="range" min="-100" max="100" step="1" value={lever}
        style={styles.lever} onChange={event => { const value=Number(event.currentTarget.value); setLever(value); input.current.climb=value/100; }}
        onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerUp={resetLever} onPointerCancel={resetLever} onLostPointerCapture={resetLever} onBlur={resetLever}
        onKeyUp={event => { if (['ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.code)) resetLever(); }} />
      <span style={styles.leverLabel}>↑{showDeveloperTools?` · ${t('actions.noseDown')}`:''}</span>
    </div>
    <div className="perix-flight-desktop-controls" style={{ ...styles.controls, right: 'max(16px, env(safe-area-inset-right))' }}>
      <button className="perix-flight-control" aria-label={t('aria.left')} aria-keyshortcuts="A" {...pointer('turn', -1)} style={styles.control}><span style={styles.controlIcon}>{showDeveloperTools?'A':'↶'}</span>{showDeveloperTools&&<small style={styles.controlLabel}>{t('actions.left')}</small>}</button>
      <button className="perix-flight-control" aria-label={t('aria.right')} aria-keyshortcuts="D" {...pointer('turn', 1)} style={styles.control}><span style={styles.controlIcon}>{showDeveloperTools?'D':'↷'}</span>{showDeveloperTools&&<small style={styles.controlLabel}>{t('actions.right')}</small>}</button>
    </div>
    <div className="perix-flight-touch-controls" style={{...styles.touchStick,left:'max(18px,env(safe-area-inset-left))'}}>
      <FlightJoystick id="flight-speed-stick" label={t('controls.speedStick')} hint={t('controls.speedHint')} showLabels={showDeveloperTools}
        directions={showDeveloperTools?{up:'W',down:'S',left:'A',right:'D'}:undefined} resetToken={resetToken}
        onChange={value=>{input.current.throttle=value.y;stickTurns.current.left=value.x;}} />
    </div>
    <div className="perix-flight-touch-controls" style={{...styles.touchStick,right:'max(18px,env(safe-area-inset-right))'}}>
      <FlightJoystick id="flight-steering-stick" label={t('controls.noseStick')} hint={t('controls.noseHint')} resetToken={resetToken} showLabels={showDeveloperTools}
        onChange={value=>{input.current.climb=value.y ? -value.y : 0;stickTurns.current.right=value.x;}} />
    </div>
    </>}
  </div>;
}

const styles = {
  orientationNotice:{order:3,flexBasis:'100%',boxSizing:'border-box',pointerEvents:'auto',display:'flex',gap:10,alignItems:'center',padding:8,borderRadius:12,background:'#0b2842f5',border:'1px solid #67869c',color:'#fff',font:'12px/1.5 system-ui'},
  viewport: { position: 'relative', isolation: 'isolate', width: '100%', height: '100%', minHeight: 180, overflow: 'hidden', background: '#0a243b', touchAction: 'none', userSelect: 'none', fontFamily: 'system-ui, sans-serif' },
  map: { position: 'absolute', inset: 0, zIndex: 0 },
  aircraftLayer: { position:'absolute', inset:0, width:'100%', height:'100%', zIndex:2, pointerEvents:'none', filter:'saturate(1.35) contrast(1.15) brightness(.9)' },
  top: { position: 'absolute', zIndex:5, top: 'max(10px, env(safe-area-inset-top))', left: 'max(12px, env(safe-area-inset-left))', right: 'max(12px, env(safe-area-inset-right))', display: 'flex', flexWrap:'wrap', alignItems: 'start', gap: 8, pointerEvents: 'none' },
  button: { boxSizing:'border-box', minHeight:44, minWidth:44, flexShrink:0, maxWidth:'25vw', padding:'8px 10px', lineHeight:1.2, whiteSpace:'normal', overflowWrap:'anywhere', borderRadius:16, border:'1px solid #67869c', background:'#0b2842ee', color:'#fff', fontSize:'clamp(11px,1.6vw,14px)', cursor:'pointer', pointerEvents:'auto', touchAction:'none' },
  status: { order:2,flexBasis:'100%', minWidth:0, boxSizing:'border-box', overflowWrap:'anywhere', color: '#fff', fontSize:'clamp(10px,1.4vw,12px)', lineHeight: '1.6', textAlign: 'center', background: '#0b2842dd', padding: '6px 12px', borderRadius: 16 },
  controls: { position: 'absolute', zIndex:5, bottom: 'max(44px, env(safe-area-inset-bottom))', display: 'flex', gap: 10 },
  leverBase: { position:'absolute', zIndex:5, left:'var(--perix-tail-x,50%)', top:'var(--perix-tail-y,68%)', transform:'translate(-50%,-50%)', display:'grid',gridTemplateRows:'16px auto 16px',justifyItems:'center',alignItems:'center',rowGap:4,padding:'8px 14px',borderRadius:24,border:'1px solid #d5eafa',background:'linear-gradient(145deg,#305772ee,#102b44ee)',boxShadow:'0 4px 12px #0008,inset 0 1px 2px #ffffff66' },
  leverLabel: { display:'block', height:16,lineHeight:'16px',whiteSpace:'nowrap',fontSize:12,color:'#fff' },
  lever: { writingMode:'vertical-lr', direction:'rtl', margin:0,boxSizing:'border-box', width:44,height:'var(--perix-lever-height,clamp(64px,18vh,110px))',accentColor:'#ffe0a6',cursor:'ns-resize',touchAction:'none' },
  touchStick: { position:'absolute',zIndex:5,bottom:'max(36px,env(safe-area-inset-bottom))' },
  control: { boxSizing:'border-box', padding:6, gap:2, minWidth:0, overflow:'hidden', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', width:'clamp(64px,10vw,84px)', height:'clamp(64px,10vw,84px)', borderRadius:22, border:'2px solid #d5eafa', background:'linear-gradient(145deg,#416581ee,#102b44ee)', boxShadow:'0 5px 0 #071b2c,inset 0 2px 3px #ffffff66', color:'#fff', fontFamily:'inherit', touchAction:'none', cursor:'pointer' },
  controlIcon: { fontSize:'clamp(22px,3vw,26px)', lineHeight:1, flexShrink:0 },
  controlLabel: { display:'block', maxWidth:'100%', minWidth:0, fontSize:'clamp(10px,1.3vw,12px)', lineHeight:1.15, whiteSpace:'normal', overflowWrap:'anywhere', textAlign:'center' },
  footer: { position:'absolute',zIndex:3,bottom:'max(8px,env(safe-area-inset-bottom))',left:'max(12px,env(safe-area-inset-left))',right:'max(12px,env(safe-area-inset-right))',display:'flex',flexDirection:'column',alignItems:'center',gap:4,textAlign:'center',pointerEvents:'none' },
  footerText: { display:'inline-block',maxWidth:'min(50vw,720px)',boxSizing:'border-box',padding:'3px 10px',borderRadius:10,background:'#0b2842cc',color:'#fff',fontSize:'clamp(10px,1.3vw,12px)',lineHeight:1.3 },
  hint: { position:'absolute', zIndex:3, top:64, left:'25%', right:'25%', color:'#fff', textShadow:'0 1px 3px #000', textAlign:'center', fontSize:12,pointerEvents:'none' },
  pauseOverlay: { position:'absolute', zIndex:4, inset:0, display:'grid', placeItems:'center', background:'#06233f66' },
  buildingPanel:{position:'absolute',zIndex:7,top:66,right:'max(12px,env(safe-area-inset-right))',width:'min(260px,70vw)',maxHeight:'calc(100% - 110px)',overflowY:'auto',padding:12,borderRadius:14,background:'#0b2842f5',border:'1px solid #67869c',color:'#fff',font:'12px/1.4 system-ui',pointerEvents:'auto'},
  buildingRow:{display:'flex',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:6,marginBottom:8},
};

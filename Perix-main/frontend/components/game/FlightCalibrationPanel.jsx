import React, { useEffect, useState } from 'react';
import { DEFAULT_FLIGHT_BUILDING_ZOOMS, ISLAND_FLIGHT_BUILDING_ZOOMS, SYROS_FLIGHT_BUILDING_ZOOMS, flightBuildingBaseWidth, withFlightBuildingZoomPoint } from '../../lib/city/flightLandmarks';
import { FLIGHT_CALIBRATION_REGIONS } from '../../lib/city/flightCalibration';
import { useTranslation } from 'react-i18next';

/** Keep incomplete numbers editable (e.g. typing 18 must not clamp the first
 * digit to 3). Commit valid values live, clamp only on blur/Enter. */
export function CalibrationNumberInput({label,value,min,max,step=1,onValue}){
  const [draft,setDraft]=useState(String(value)),[editing,setEditing]=useState(false);
  useEffect(()=>{if(!editing)setDraft(String(value));},[value,editing]);
  const commit=event=>{
    const raw=event.currentTarget.value,n=raw.trim()===''?value:Number(raw);
    const next=Number.isFinite(n)?Math.max(min,Math.min(max,n)):value;
    setDraft(String(next));setEditing(false);onValue(next);
  };
  return <input aria-label={label} style={s.number} type="number" min={min} max={max} step={step} value={editing?draft:value}
    onFocus={()=>{setDraft(String(value));setEditing(true);}}
    onChange={event=>{const raw=event.target.value;setDraft(raw);const n=Number(raw);if(raw.trim()!==''&&Number.isFinite(n)&&n>=min&&n<=max)onValue(n);}}
    onBlur={commit} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}}}/>;
}

/** A dock, not a blocking modal: the remaining scene stays available for drag/zoom. */
export default function FlightCalibrationPanel({view,actual,settings,onView,onSettings,onResetView,onClose,collapsed,onCollapse,region='default',onRegion,buildingLayerError,onRetryBuildings}){
  const {t}=useTranslation('flight');
  const [exportOpen,setExportOpen]=useState(false);
  const points=settings.zoomPoints?.length?settings.zoomPoints:region==='default'?DEFAULT_FLIGHT_BUILDING_ZOOMS:region==='syros'?SYROS_FLIGHT_BUILDING_ZOOMS:ISLAND_FLIGHT_BUILDING_ZOOMS;
  const change=(key,value)=>onSettings({...settings,[key]:value});
  const setWidth=value=>onSettings(withFlightBuildingZoomPoint({...settings,zoomPoints:points},view.zoom,value));
  const field=(label,value,min,max,step,onChange)=><label style={s.field}>{label}
    <span style={s.inputs}><input aria-label={label} style={{flex:1,minWidth:0,width:0}} type="range" min={min} max={max} step={step} value={value}
      onChange={e=>onChange(Number(e.target.value))}/><CalibrationNumberInput label={`${label} ${t('value')}`} value={value} min={min} max={max} step={step} onValue={onChange}/></span></label>;
  return <aside data-testid="flight-calibration-panel" style={{...s.panel,width:collapsed?148:320}}
    onKeyDown={e=>e.stopPropagation()} onKeyUp={e=>e.stopPropagation()}>
    <header style={{...s.row,position:'sticky',top:-12,zIndex:2,background:'#0a2035',padding:'8px 0',flexWrap:'wrap'}}><strong>{t('panel.title')}</strong>
      <button style={s.button} onClick={onCollapse} aria-label={t('aria.toggleDock')}>{t(collapsed?'panel.expand':'panel.collapse')}</button>
      <button style={s.button} onClick={onClose} aria-label={t('aria.closeDock')}>×</button></header>
    {!collapsed&&<>
      <label style={s.field}>{t('panel.region')}
        <select aria-label={t('aria.region')} style={{...s.number,width:'100%'}} value={region} onChange={e=>onRegion?.(e.target.value)}>
          {FLIGHT_CALIBRATION_REGIONS.map(item=><option key={item.id} value={item.id}>{t(`regions.${item.id}`)}</option>)}
        </select></label>
      <small>{t('panel.regionHelp')}</small>
      <p>{t('panel.frozen')}</p>
      <div role="status" style={s.readout}>{t('panel.actual',{zoom:actual.zoom.toFixed(2),tilt:actual.tilt.toFixed(1)})}<br/>
        {t('nearest',{width:actual.nearestWidth.toFixed(1),distance:Math.round(actual.nearestDistance)})}<br/>
        <span data-testid="flight-calibration-load-status">{t('loadSummary',{loaded:actual.buildings?.loaded??0,count:actual.buildings?.count??0,pending:actual.buildings?.pending??0,failed:actual.buildings?.failed??0})}</span>
        {(buildingLayerError||actual.buildings?.failed>0)&&<button style={s.button} onClick={onRetryBuildings}>{t('actions.retry')}</button>}
      </div>
      {field(t('panel.cameraZoom'),view.zoom,3,23,.05,v=>onView({...view,zoom:v}))}
      <h3 style={s.heading}>{t('panel.sizeAtZoom',{zoom:view.zoom.toFixed(2)})}</h3>
      {field(t('panel.baseWidth'),flightBuildingBaseWidth(view.zoom,points),2,4096,1,setWidth)}
      <button style={s.button} onClick={()=>onSettings({...settings,scale:1,maxWidth:4096,distanceFalloff:0})}>{t('panel.exact')}</button>
      <p><small>{t('panel.pixelHelp')}</small></p>
      {field(t('panel.scale'),settings.scale*100,10,2000,10,v=>change('scale',v/100))}
      {field(t('panel.maxWidth'),settings.maxWidth,20,4096,1,v=>change('maxWidth',v))}
      {field(t('panel.range'),settings.maxDistanceM/1000,.25,200,.25,v=>change('maxDistanceM',v*1000))}
      {field(t('panel.falloff'),settings.distanceFalloff??1,0,4,.05,v=>change('distanceFalloff',v))}
      <label style={s.row}><input type="checkbox" checked={settings.enabled} onChange={e=>change('enabled',e.target.checked)}/> {t('panel.enabled')}</label>
      <h3 style={s.heading}>{t('panel.camera')}</h3>
      {field(t('panel.heading'),view.heading,0,359,1,v=>onView({...view,heading:v}))}
      {field(t('panel.tilt'),view.tilt,0,85,1,v=>onView({...view,tilt:v}))}
      {field(t('panel.altitude'),view.altitude,0,50000,5,v=>onView({...view,altitude:v}))}
      <p><small>{t('panel.cameraHelp')}</small></p>
      <button style={s.button} onClick={onResetView}>{t('panel.resetView')}</button>
      <h3 style={s.heading}>{t('panel.curve')} · {t(`regions.${region}`)}</h3>
      <div style={s.row}><small>Zoom</small><small>{t('panel.width')}</small><small>{t('panel.delete')}</small></div>
      {points.map(([z,px])=><div style={s.row} key={z}>
        <button style={s.button} onClick={()=>onView({...view,zoom:z})}>{z.toFixed(2)}</button>
        <CalibrationNumberInput label={t('aria.widthAtZoom',{zoom:z})} value={px} min={2} max={4096}
          onValue={value=>onSettings(withFlightBuildingZoomPoint({...settings,zoomPoints:points},z,value))}/>
        <button aria-label={t('aria.deleteZoom',{zoom:z})} style={s.button} onClick={()=>change('zoomPoints',points.filter(p=>p[0]!==z))}>×</button>
      </div>)}
      <button style={s.button} onClick={()=>change('zoomPoints',undefined)}>{t('panel.reset')}</button>{' '}
      <button style={s.button} onClick={()=>setExportOpen(v=>!v)}>{t('panel.export')}</button>
      {exportOpen&&<textarea aria-label={t('aria.exportJson')} readOnly style={s.export} value={JSON.stringify({region,...settings,zoomPoints:points},null,2)} onFocus={e=>e.target.select()}/>}
      <p><small>{t('panel.sessionHelp')}</small></p>
    </>}
    <button style={{...s.button,width:'100%',marginTop:8}} onClick={onClose}>{t('panel.done')}</button>
  </aside>;
}
const s={
  panel:{position:'absolute',right:0,top:0,bottom:0,zIndex:8,boxSizing:'border-box',maxWidth:'48vw',padding:12,overflowY:'auto',overscrollBehavior:'contain',touchAction:'pan-y',background:'#0a2035f5',color:'#f5f8fc',font:'12px/1.5 system-ui',borderLeft:'1px solid #6b8ca5',pointerEvents:'auto'},
  row:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:6,margin:'8px 0'},
  field:{display:'block',margin:'12px 0'},inputs:{display:'flex',gap:8,alignItems:'center'},
  number:{width:78,minHeight:36,boxSizing:'border-box',fontSize:14,borderRadius:6,border:'1px solid #829fb7',padding:4},
  button:{minHeight:36,padding:'6px 8px',border:'1px solid #829fb7',borderRadius:8,background:'#224360',color:'#fff',cursor:'pointer',touchAction:'manipulation'},
  heading:{fontSize:14,borderTop:'1px solid #52718d',paddingTop:12,marginBottom:8},readout:{padding:8,background:'#183c58',borderRadius:8},
  export:{width:'100%',height:180,boxSizing:'border-box',userSelect:'text',font:'11px monospace',marginTop:8},
};

import React, { useEffect, useRef, useState } from 'react';
import { flightJoystickAxes } from '../../lib/city/flightControls';

/** Independent pointer capture per thumb. Neutral/release holds speed on the
 * throttle and levels climb/turn on the steering stick; no stuck controls. */
export default function FlightJoystick({ id, label, hint, directions = {up:'↑',down:'↓',left:'←',right:'→'}, vertical = false, resetToken, onChange,showLabels=true }) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const active = useRef(null), surface = useRef(null), change = useRef(onChange);
  change.current = onChange;
  const release = (update = true) => {
    const pointer = active.current; active.current = null;
    if (update) setPosition({ x: 0, y: 0 });
    change.current?.({ x: 0, y: 0 });
    try { if (pointer !== null && surface.current?.hasPointerCapture?.(pointer)) surface.current.releasePointerCapture(pointer); } catch {}
  };
  useEffect(() => { release(); }, [resetToken]);
  useEffect(() => () => release(false), []);
  const move = event => {
    const axes = flightJoystickAxes(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), vertical);
    setPosition(axes); change.current?.(axes);
  };
  return <div style={styles.group} role="group" aria-label={label} data-testid={id}>
    {showLabels&&<span style={styles.label}>{label}</span>}
    <div ref={surface} style={{ ...styles.base, ...(vertical ? styles.vertical : null) }}
      onPointerDown={event => {
        if (active.current !== null) return;
        event.preventDefault(); active.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId); move(event);
      }}
      onPointerMove={event => { if (active.current === event.pointerId) { event.preventDefault(); move(event); } }}
      onPointerUp={event => { if (active.current === event.pointerId) release(); }}
      onPointerCancel={event => { if (active.current === event.pointerId) release(); }}
      onLostPointerCapture={event => { if (active.current === event.pointerId) release(); }}>
      <span aria-hidden style={styles.up}>{directions.up}</span><span aria-hidden style={styles.down}>{directions.down}</span>
      {!vertical && <><span aria-hidden style={styles.left}>{directions.left}</span><span aria-hidden style={styles.right}>{directions.right}</span></>}
      <div aria-hidden style={{ ...styles.knob, transform: `translate(calc(-50% + ${position.x * 36}px),calc(-50% - ${position.y * 36}px))` }} />
    </div>
    {showLabels&&hint && <span style={styles.hint}>{hint}</span>}
  </div>;
}
const styles = {
  group: { display:'flex',flexDirection:'column',alignItems:'center',gap:6,userSelect:'none' },
  label: { color:'#fff',font:'600 12px system-ui',background:'#0b2842e6',padding:'4px 10px',borderRadius:12,textAlign:'center',maxWidth:'min(190px,32vw)' },
  hint: { color:'#fff',font:'500 10px system-ui',textAlign:'center',maxWidth:'min(190px,32vw)',textShadow:'0 1px 3px #000' },
  base: { position:'relative',width:'clamp(112px,23vh,148px)',height:'clamp(112px,23vh,148px)',borderRadius:'50%',border:'2px solid #d5eafa',background:'radial-gradient(circle,#244963e6,#0b2842ed)',boxShadow:'0 4px 0 #071b2c,inset 0 2px 6px #ffffff44',touchAction:'none' },
  vertical: { borderRadius:30 },
  knob: { position:'absolute',left:'50%',top:'50%',width:46,height:46,borderRadius:'50%',pointerEvents:'none',background:'radial-gradient(circle at 35% 25%,#fff5d5,#e0af69)',border:'2px solid #fff4d4',boxShadow:'0 4px 8px #0009,inset 0 2px 3px #ffffffaa' },
  up: { position:'absolute',left:'50%',top:6,transform:'translateX(-50%)',color:'#fff',pointerEvents:'none' },
  down: { position:'absolute',left:'50%',bottom:6,transform:'translateX(-50%)',color:'#fff',pointerEvents:'none' },
  left: { position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:'#fff',pointerEvents:'none' },
  right: { position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',color:'#fff',pointerEvents:'none' },
};

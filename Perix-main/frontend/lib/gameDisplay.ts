/** Own only the display state requested by this game session, never location. */
export const GAME_RETURN_EVENT = "perix:game-return";
export type GameOrientationStatus='requesting'|'locked'|'unavailable'|'denied'|'closed';
export type GameDisplayStatus=GameOrientationStatus|'fullscreen-requesting'|'fullscreen-entered'|'fullscreen-unavailable'|'fullscreen-denied';
export function gameDisplayMessage(status:GameDisplayStatus,translate?:(key:string,fallback:string)=>string):string{
  if(translate&&status!=='closed')return translate('display.'+status,gameDisplayMessage(status));
  if(status==='fullscreen-requesting')return 'Requesting fullscreen. Flight does not need to wait for approval.';
  if(status==='fullscreen-entered')return 'Fullscreen is active.';
  if(status==='fullscreen-unavailable'||status==='fullscreen-denied')return 'Fullscreen is unavailable or was not allowed. Play in landscape and try the Fullscreen button after starting. Some iPhone Safari versions do not support page fullscreen.';
  if(status==='requesting')return 'Requesting landscape orientation, without requesting fullscreen.';
  if(status==='locked')return 'Landscape orientation is active.';
  if(status==='unavailable'||status==='denied')return 'This browser cannot lock landscape here. Rotate your device manually and turn off orientation lock if needed. Fullscreen is not required.';
  return '';
}
/** Try fullscreen from Start, but never block mounting a landscape game.
 * Explicit landscape/fullscreen actions remain independent user gestures. */
export function createGameDisplaySession(doc: any, orientation: any, onStatus?:(status:GameDisplayStatus)=>void) {
  let closed = false;
  let ownsFullscreen=false,fullscreenPending=false,fullscreenGeneration=0;
  let ownsOrientation = false;
  let entering = false;
  const fullscreenElement=()=>doc.fullscreenElement||doc.webkitFullscreenElement;
  const release = async () => {
    if (ownsOrientation) {
      ownsOrientation = false;
      try { orientation?.unlock?.(); } catch {}
    }
    if(ownsFullscreen){
      ownsFullscreen=false;
      try{if(fullscreenElement()===doc.documentElement)await (doc.exitFullscreen||doc.webkitExitFullscreen)?.call(doc);}catch{}
    }
  };
  const landscape=async(quiet=false):Promise<GameOrientationStatus>=>{
      if (closed) return 'closed';
      if (entering) return 'requesting';
      entering = true;
      let status:GameOrientationStatus='unavailable';
      if(!quiet)onStatus?.('requesting');
      try {
        // Keep the receiver: calling a detached lock() throws Illegal invocation.
        if (typeof orientation?.lock==='function') {
          await orientation.lock("landscape");
          ownsOrientation = true;
          status='locked';
        }
      } catch {
        status='denied'; // Manual rotation is the fallback, NEVER fullscreen.
      } finally {
        entering = false;
        if (closed) await release();
      }
      if(closed)return 'closed';
      if(!quiet)onStatus?.(status);return status;
  };
  const fullscreen=async(retryPending=false):Promise<GameDisplayStatus>=>{
    if(closed)return 'closed';
    if(fullscreenPending&&!retryPending){onStatus?.('fullscreen-requesting');return 'fullscreen-requesting';}
    const generation=++fullscreenGeneration;fullscreenPending=true;onStatus?.('fullscreen-requesting');
    let status:GameDisplayStatus='fullscreen-unavailable';
    try{
      if(fullscreenElement())status='fullscreen-entered';
      else{
        const root=doc.documentElement;
        const request=typeof root?.requestFullscreen==='function'&&doc.fullscreenEnabled!==false?root.requestFullscreen
          :typeof root?.webkitRequestFullscreen==='function'&&doc.webkitFullscreenEnabled!==false?root.webkitRequestFullscreen:null;
        if(request){
          await request.call(root);
          if(fullscreenElement()===root){ownsFullscreen=true;status='fullscreen-entered';}
          else status='fullscreen-denied';
        }
      }
    }catch{status='fullscreen-denied';}
    finally{
      if(generation===fullscreenGeneration)fullscreenPending=false;
      if(closed)await release();
    }
    if(closed)return 'closed';
    if(generation===fullscreenGeneration)onStatus?.(status);
    return status;
  };
  return {
    async enter(){
      await fullscreen();
      if(closed)return 'closed';
      return landscape(true);
    },
    landscape:()=>landscape(),
    fullscreen:()=>fullscreen(true), // A fresh explicit click may retry a pending initial request.
    async close() { closed = true; await release(); },
  };
}

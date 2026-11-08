/** Decoration only: never filter physical platforms or retime transit. */
export function transitStopAppearance(zoom: number) {
  const z=Number.isFinite(zoom)?zoom:12;
  if(z<12)return{bucket:'dot4',dot:true,size:4,icon:0,platforms:false,names:false};
  if(z<14)return{bucket:'dot6',dot:true,size:6,icon:0,platforms:false,names:false};
  if(z<15)return{bucket:'dot8',dot:true,size:8,icon:0,platforms:false,names:false};
  if(z<16)return{bucket:'icon14',dot:false,size:14,icon:10,platforms:false,names:false};
  if(z<17)return{bucket:'platforms20',dot:false,size:20,icon:12,platforms:true,names:false};
  return{bucket:'names24',dot:false,size:24,icon:14,platforms:true,names:true};
}

/** Directory pins start legible from a distance and grow smoothly, with a cap. */
export function mapEntityPinSize(zoom:number){
  const z=Number.isFinite(zoom)?zoom:12;
  const scale=Math.max(0.8,Math.min(1.6,z/12));
  return Math.max(24,Math.min(44,Math.round(28*scale)));
}

export function profileInitial(name?: string | null) {
  return Array.from((name || '').trim())[0]?.toLocaleUpperCase() || '?';
}

/** Google OverlayView content. textContent prevents names becoming markup. */
export function createUserPinElement(doc:Document,imageUrl?:string | null,name?:string | null) {
  const pin=doc.createElement('div');
  pin.dataset.testid='user-location-pin';pin.dataset.userInitial=profileInitial(name);
  Object.assign(pin.style,{width:'34px',height:'34px',borderRadius:'50%',border:'3px solid #ffffff',
    boxShadow:'0 1px 6px rgba(0,0,0,0.45)',backgroundColor:'#59ABE3',overflow:'hidden',
    transform:'translate(-50%, -50%)',boxSizing:'border-box',display:'flex',alignItems:'center',justifyContent:'center',
    color:'#fff',fontSize:'16px',fontWeight:'700'});
  pin.textContent=profileInitial(name);
  if(imageUrl){
    const img=doc.createElement('img');img.src=imageUrl;img.alt=name || '';
    Object.assign(img.style,{position:'absolute',inset:'0',width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'});
    img.onerror=()=>{img.style.display='none';};pin.appendChild(img);
  }
  return pin;
}

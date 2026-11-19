import { ORIGINAL_LANDMARKS } from './originalLandmarks.generated';
import { ISLAND_LANDMARKS } from './islandLandmarks.generated';

/** Use the existing own town-centre pins, never GPS, new geocoding or /app writes. */
const pins=[...ORIGINAL_LANDMARKS,...ISLAND_LANDMARKS];
export const FLIGHT_START_CITIES=[
  {id:'magdeburg',label:'Μαγδεμβούργο',pinId:'legacy-042'},
  {id:'syros',label:'Σύρος',pinId:'GR-SYROS-001'},
  {id:'mykonos',label:'Μύκονος',pinId:'GR-MYKONOS-036'},
].map(city=>{
  const pin=pins.find(point=>point.id===city.pinId);
  if(!pin)throw Error('Missing flight start pin: '+city.pinId);
  return {...city,pinName:pin.name,latitude:pin.latitude,longitude:pin.longitude};
});

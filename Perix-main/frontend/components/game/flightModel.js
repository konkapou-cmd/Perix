import * as THREE from 'three';

/** A self-contained stylized toy aircraft. No image/model downloads or fake
 * geographic geometry. Y is up, nose is -Z; the map transform handles Z-up.
 */
export function createFlightModel() {
  const plane = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xc84434, roughness: 0.38, metalness: 0.15 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xffe6b3, roughness: 0.48 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x203b55, roughness: 0.3 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9d5d9, roughness: 0.25, metalness: 0.65 });
  const mesh = (geometry, material, x, y, z) => {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z); plane.add(object); return object;
  };
  // Rounded fuselage and a contrasting nose.
  const body = mesh(new THREE.SphereGeometry(1, 24, 16), red, 0, 0, 0);
  body.scale.set(0.65, 0.65, 3.8);
  const nose = mesh(new THREE.SphereGeometry(0.64, 20, 12), metal, 0, 0, -3.2);
  nose.scale.z = 0.9;
  const canopy = mesh(new THREE.SphereGeometry(1, 20, 12), dark, 0, 0.55, -0.5);
  canopy.scale.set(0.48, 0.54, 1.15);
  // Tapered wing outlines (not billboard cutouts).
  const wingShape = new THREE.Shape();
  wingShape.moveTo(-5.3, -0.1); wingShape.lineTo(-5.0, 1.1);
  wingShape.lineTo(0, 1.5); wingShape.lineTo(5.0, 1.1);
  wingShape.lineTo(5.3, -0.1); wingShape.lineTo(0, -0.65); wingShape.closePath();
  const wings = mesh(new THREE.ExtrudeGeometry(wingShape, { depth: 0.14, bevelEnabled: false }), cream, 0, -0.1, 0);
  wings.rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(3.8, 0.13, 0.9), cream, 0, 0.25, 2.8);
  const fin = mesh(new THREE.BoxGeometry(0.13, 1.5, 1.5), red, 0, 0.8, 2.6);
  fin.rotation.x = -0.18;
  // Wing markings and navigation lights are 3D meshes, no PNG needed.
  for (const x of [-4.3, 4.3]) mesh(new THREE.BoxGeometry(0.38, 0.17, 1.1), red, x, 0, -0.25);
  for (const [x, color] of [[-5.1, 0xff4433], [5.1, 0x4eff99]]) {
    mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color }), x, 0, 0);
  }
  const propeller = new THREE.Group();
  propeller.position.z = -3.85;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.5, 0.1), dark);
  propeller.add(blade); plane.add(propeller);
  const bounds = new THREE.Box3().setFromObject(plane), framingPoints=[];
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])framingPoints.push(x,y,z);
  return { plane, propeller, wingspan:10.6, framingPoints:new Float32Array(framingPoints) };
}

export function disposeFlightScene(scene, renderer) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  scene?.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [].concat(object.material || [])) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  const images = new Set();
  textures.forEach(texture => { if(texture.image)images.add(texture.image); texture.dispose(); });
  images.forEach(image => image.close?.());
  scene?.clear();
  renderer?.dispose(); // Never forceContextLoss: Maps owns the shared context.
}

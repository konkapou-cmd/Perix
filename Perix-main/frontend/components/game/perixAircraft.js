import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { Asset } from 'expo-asset';

export const PERIX_AIRCRAFT_URL = Asset.fromModule(require('../../assets/game/perix-airplane-characters-animated.glb')).uri;

/** Hold a single authored directional pose, blended smoothly. Never replay a
 * looping turn/head twitch while the same steering input remains held. */
export function createAircraftAnimation(model, clips = []) {
  const mixer = new THREE.AnimationMixer(model);
  const weights = new Map();
  const actions = new Map(clips.map(clip => {
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true;
    action.time = clip.name === 'Perix_Idle' ? 0 : clip.duration * .5;
    action.setEffectiveWeight(clip.name === 'Perix_Idle' ? 1 : 0).play();
    action.paused = true;
    weights.set(clip.name, clip.name === 'Perix_Idle' ? 1 : 0);
    return [clip.name, action];
  }));
  const clamp = value => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  return {
    update(dt, steering = 0, climb = 0) {
      const s = clamp(steering), p = clamp(climb), total = Math.max(1, Math.abs(s) + Math.abs(p));
      const targets = { Perix_Idle: Math.max(0, 1 - Math.abs(s) - Math.abs(p)),
        Perix_TurnRight: Math.max(0, s) / total, Perix_TurnLeft: Math.max(0, -s) / total,
        Perix_Climb: Math.max(0, p) / total, Perix_Dive: Math.max(0, -p) / total };
      const seconds = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .05)) : 0;
      const blend = 1 - Math.exp(-8 * seconds);
      for (const [name, action] of actions) {
        const target = targets[name] || 0, current = weights.get(name) || 0;
        const next = Math.abs(target-current)<.0001 ? target : current+(target-current)*blend;
        weights.set(name,next);action.setEffectiveWeight(next);
      }
      mixer.update(0); // Sample the fixed poses; only their weights move.
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(model); },
  };
}

export async function loadPerixAircraft() {
  const gltf = await new GLTFLoader().loadAsync(PERIX_AIRCRAFT_URL);
  const plane = new THREE.Group();
  plane.add(gltf.scene);
  const propeller = new THREE.Group();
  // The supplied geometry is baked in model coordinates, nose -Z, up +Y.
  propeller.position.set(0, 0.02, -3.65);
  plane.add(propeller); plane.updateMatrixWorld(true);
  const rotating = [];
  const tailBounds = new THREE.Box3();
  const framingPoints = [];
  const materials = new Set();
  const animatedRoots = new Set();
  for (const clip of gltf.animations || []) for (const track of clip.tracks) {
    const name = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
    const node = gltf.scene.getObjectByName(name); if (node) animatedRoots.add(node);
  }
  gltf.scene.traverse(object => {
    if (!object.isMesh) return;
    object.geometry.computeBoundingBox();
    const box = object.geometry.boundingBox;
    if (box) for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const point = new THREE.Vector3(x, y, z).applyMatrix4(object.matrixWorld);
      framingPoints.push(point.x, point.y, point.z);
    }
    if (/^horizontal_tail_/.test(object.name)) tailBounds.expandByObject(object);
    if (/^(propeller_blade_|blue_painted_propeller_tip_|gold_propeller_spinner_|propeller_center_)/.test(object.name)) rotating.push(object);
    object.renderOrder = 20;
    for (const material of [].concat(object.material || [])) {
      if (materials.has(material)) continue;
      materials.add(material);
      // Preserve every original colour/texture/logo. A small textured fill
      // keeps the hero readable even over the shaded side of the city.
      material.emissive.copy(material.color).multiplyScalar(0.04);
      if (material.map) material.emissiveMap = material.map;
      material.roughness = Math.min(material.roughness, 0.65);
      material.needsUpdate = true;
      // The aircraft has its OWN transparent canvas above Google's DOM/labels.
      // Keep depth inside the model so wings/canopy occlude each other properly.
      material.depthTest = true;
      material.depthWrite = true;
    }
  });
  rotating.forEach(object => propeller.attach(object));
  // Keep the head-animation envelope in the camera fit, including full turns.
  for (const root of animatedRoots) {
    const box = new THREE.Box3().setFromObject(root), pivot = root.getWorldPosition(new THREE.Vector3());
    if (box.isEmpty()) continue;
    let radius = 0;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z])
      radius = Math.max(radius, pivot.distanceTo(new THREE.Vector3(x, y, z)));
    for (const x of [-radius, radius]) for (const y of [-radius, radius]) for (const z of [-radius, radius])
      framingPoints.push(pivot.x + x, pivot.y + y, pivot.z + z);
  }
  // Batch by material AND animation root. Never bake a moving head into the
  // static body, which would otherwise silently destroy its animation.
  plane.updateMatrixWorld(true);
  const batches = new Map();
  gltf.scene.traverse(object => {
    if (!object.isMesh || object.isSkinnedMesh || animatedRoots.has(object) || Array.isArray(object.material)) return;
    let batchRoot = object.parent;
    while (batchRoot && batchRoot !== gltf.scene && !animatedRoots.has(batchRoot)) batchRoot = batchRoot.parent;
    if (!animatedRoots.has(batchRoot)) batchRoot = plane;
    const key = batchRoot.uuid + ':' + object.material.uuid + ':' + Object.keys(object.geometry.attributes).sort().join(',');
    if (!batches.has(key)) batches.set(key, { root: batchRoot, objects: [] });
    batches.get(key).objects.push(object);
  });
  for (const { root, objects } of batches.values()) {
    if (objects.length < 2) continue;
    const copies = objects.map(object => {
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      const local = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(object.matrixWorld);
      return geometry.applyMatrix4(local);
    });
    const merged = mergeGeometries(copies, false);
    copies.forEach(geometry => geometry.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, objects[0].material);
    mesh.name = root === plane ? 'PERIX_static_batch' : 'PERIX_animated_batch'; mesh.renderOrder = 20; root.add(mesh);
    objects.forEach(object => { object.removeFromParent(); object.geometry.dispose(); });
  }
  // A convex camera frustum only needs the envelope vertices, not all 1,856
  // original box corners on every bank/climb frame. This changes NO meshes.
  const hull = new ConvexHull().setFromPoints(Array.from({length:framingPoints.length/3},(_,i)=>
    new THREE.Vector3(framingPoints[i*3],framingPoints[i*3+1],framingPoints[i*3+2])));
  const envelope = new Set();
  for(const face of hull.faces)for(let i=0;i<3;i++)envelope.add(face.getEdge(i).head().point);
  const compact = [];
  envelope.forEach(point=>compact.push(point.x,point.y,point.z));
  const animation = createAircraftAnimation(gltf.scene, gltf.animations || []);
  animation.update(0);
  return { plane, propeller, animation, wingspan: 8.9632, framingPoints: new Float32Array(compact),
    tailAnchor: tailBounds.isEmpty() ? undefined : tailBounds.getCenter(new THREE.Vector3()) };
}

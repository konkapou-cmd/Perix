import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { soundEngine } from './soundEngine';

// Διαδρομές δρόμων (Lat/Lng) στο Μαγδεμβούργο — αντικατάστησε με τις δικές σου συντεταγμένες αν θέλεις
const DEFAULT_STREET_LINES = [
  [
    { lat: 52.1292, lng: 11.6335 },
    { lat: 52.1315, lng: 11.6342 },
    { lat: 52.1338, lng: 11.6350 },
    { lat: 52.1355, lng: 11.6356 }
  ],
  [
    { lat: 52.1315, lng: 11.6295 },
    { lat: 52.1315, lng: 11.6342 },
    { lat: 52.1314, lng: 11.6388 }
  ],
  [
    { lat: 52.1338, lng: 11.6302 },
    { lat: 52.1338, lng: 11.6350 },
    { lat: 52.1337, lng: 11.6392 }
  ]
];

const DEFAULT_OBSTACLES = [
  { lat: 52.1324, lng: 11.6345, radius: 1.9 }
];

export default function MagdeburgSportCabrioGame({
  apiKey,
  mapId,
  // Start point of car + camera. Falls back to streetLines[0][0], then Magdeburg.
  startPoint = null,
  // Empty streetLines = free-roam (no street-bound eject). Obstacles still apply.
  streetLines = [],
  obstacles = [],
  laneHalfWidth = 4.6,
  // Opening camera zoom - the app uses its area-scale zoom (e.g. /app).
  initialZoom = 20.2,
  // Back button handler (-> /app). Hidden when not provided.
  onExit = null,
}) {
  const mapDivRef = useRef(null);
  const [statusText, setStatusText] = useState('Φόρτωση 3D χάρτη...');
  const [hudStats, setHudStats] = useState({ gear: 1, boost: 'x1', kmh: 0 });
  const [isMuted, setIsMuted] = useState(false);

  const throttleRef = useRef(0);
  const steerRef = useRef(0);
  const keysRef = useRef({});

  const [leftKnobY, setLeftKnobY] = useState(0);
  const [rightKnobX, setRightKnobX] = useState(0);

  const unlockAudio = () => {
    soundEngine.init();
  };

  const handleToggleAudio = (e) => {
    e.stopPropagation();
    soundEngine.init();
    const muted = soundEngine.toggleMute();
    setIsMuted(muted);
  };

  useEffect(() => {
    let map;
    let overlay;

    // Same classic script-tag boot as BusinessMap.web.tsx: everything loads
    // in one script and google.maps.Map is ready on onload. The packaged
    // @googlemaps/js-api-loader no longer exports `Loader` (functional API
    // only), so building our own avoids the runtime throw entirely.
    const loadGoogleScript = () => new Promise((resolve, reject) => {
      const w = window;
      if (w.google && w.google.maps && w.google.maps.Map) { resolve(w.google); return; }
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
      script.async = true;
      script.onload = () => {
        if (w.google && w.google.maps && w.google.maps.Map) resolve(w.google);
        else reject(new Error('Google Maps API not available'));
      };
      script.onerror = () => reject(new Error('Google Maps script load failed'));
      document.head.appendChild(script);
    });

    loadGoogleScript().then((google) => {
      // Start: explicit origin prop wins, then first street point, then Magdeburg fallback.
      const firstStreetPt = (streetLines[0] && streetLines[0][0]) || null;
      const startOrigin = startPoint && Number.isFinite(startPoint.latitude) && Number.isFinite(startPoint.longitude)
        ? { lat: startPoint.latitude, lng: startPoint.longitude }
        : firstStreetPt || { lat: 52.13, lng: 11.63 };
      const hasStreets = Array.isArray(streetLines) && streetLines.some((l) => Array.isArray(l) && l.length > 1);
      const origin = startOrigin;

      map = new google.maps.Map(mapDivRef.current, {
        center: origin,
        zoom: initialZoom,
        tilt: 67,
        heading: 0,
        mapId,
        mapTypeId: 'roadmap',
        disableDefaultUI: true,
        gestureHandling: 'none',
        keyboardShortcuts: false
      });

      // The WebGL scene must sit ON the map's terrain, not at altitude 0
      // (sea level). Magdeburg lies ~56m above the ellipsoid, so a scene
      // anchored at altitude 0 renders tens of meters below the visible
      // ground - the car then slides vertically on screen at 67° tilt.
      // Sample the map's own terrain elevation and anchor the projection
      // there, refreshing every ~30m of travel.
      let groundAltitude = 0;
      let elevationService = null;
      let elevationSample = null;
      try { elevationService = new google.maps.ElevationService(); } catch (e) {}
      const sampleElevation = (lat, lng) => {
        if (!elevationService || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
        if (elevationSample) {
          const meters = Math.hypot((lat - elevationSample.lat) * 111320,
            (lng - elevationSample.lng) * 111320 * Math.cos(THREE.MathUtils.degToRad(lat)));
          if (meters < 30) return;
        }
        elevationSample = { lat, lng };
        try {
          elevationService.getElevationForLocations({ locations: [new google.maps.LatLng(lat, lng)] }, (results, status) => {
            if (status === google.maps.ElevationStatus.OK && results && results[0]
              && Number.isFinite(results[0].elevation)) {
              groundAltitude = results[0].elevation;
            }
          });
        } catch (e) {}
      };
      sampleElevation(origin.lat, origin.lng);

      const latLngToMeters = (lat, lng) => {
        const R = 6378137;
        const dLat = THREE.MathUtils.degToRad(lat - origin.lat);
        const dLng = THREE.MathUtils.degToRad(lng - origin.lng);
        const x = dLng * R * Math.cos(THREE.MathUtils.degToRad(origin.lat));
        const z = -dLat * R;
        return new THREE.Vector3(x, 0, z);
      };

      const meterPolylines = streetLines.map((line) =>
        line.map((pt) => latLngToMeters(pt.lat, pt.lng))
      );

      const meterObstacles = obstacles.map((obs) => ({
        pos: latLngToMeters(obs.lat, obs.lng),
        radius: obs.radius || 1.9
      }));

      overlay = new google.maps.WebGLOverlayView();
      let scene, camera, renderer;
      let carGroup, bodyTiltGroup, steeringWheel, redLightMat;
      let wheelFL, wheelFR, wheelBL, wheelBR;
      let riderGroup, leftLeg, rightLeg;

      const smokeParticles = [];
      const skidMarks = [];
      let skidTimer = 0;
      let hudUpdateTimer = 0;

      const startPt = meterPolylines.length
        ? meterPolylines[0][0].clone()
        : latLngToMeters(origin.lat, origin.lng);
      const nextPt = meterPolylines.length && meterPolylines[0][1]
        ? meterPolylines[0][1]
        : startPt.clone();
      const initialHeading = meterPolylines.length
        ? Math.atan2(startPt.x - nextPt.x, startPt.z - nextPt.z)
        : 0;

      const state = {
        mode: 'DRIVING', // 'DRIVING' | 'FLYING' | 'WALKING'
        carPos: startPt.clone(),
        carHeading: initialHeading,
        speed: 0,
        steerAngle: 0,
        throttleHoldTime: 0,
        boostMultiplier: 1,
        prevBoostTier: 1,
        gear: 1,
        riderPos: startPt.clone(),
        riderVel: new THREE.Vector3(),
        riderSpin: new THREE.Vector3(),
        safeCenter: startPt.clone(),
        safeHeading: initialHeading
      };

      const evaluateStreetBounds = (pos) => {
        // Free-roam: no street lines -> always valid (obstacles still apply).
        if (!hasStreets) {
          for (const obs of meterObstacles) {
            if (pos.distanceTo(obs.pos) < obs.radius) {
              return { valid: false, nearest: state.safeCenter, heading: state.safeHeading };
            }
          }
          return { valid: true, nearest: pos.clone(), heading: state.carHeading };
        }
        for (const obs of meterObstacles) {
          if (pos.distanceTo(obs.pos) < obs.radius) {
            return { valid: false, nearest: state.safeCenter, heading: state.safeHeading };
          }
        }

        let minDist = Infinity;
        let closestPt = startPt.clone();
        let bestHeading = initialHeading;

        for (const line of meterPolylines) {
          for (let i = 0; i < line.length - 1; i++) {
            const a = line[i];
            const b = line[i + 1];
            const abx = b.x - a.x;
            const abz = b.z - a.z;
            const lenSq = abx * abx + abz * abz;
            const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((pos.x - a.x) * abx + (pos.z - a.z) * abz) / lenSq));
            const px = a.x + t * abx;
            const pz = a.z + t * abz;
            const dist = Math.hypot(pos.x - px, pos.z - pz);

            if (dist < minDist) {
              minDist = dist;
              closestPt.set(px, 0, pz);
              bestHeading = Math.atan2(-abx, -abz);
            }
          }
        }

        return {
          valid: minDist <= laneHalfWidth,
          nearest: closestPt,
          heading: bestHeading
        };
      };

      overlay.onAdd = () => {
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera();

        const ambient = new THREE.AmbientLight(0xffffff, 0.9);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.95);
        dirLight.position.set(15, 30, 15);
        scene.add(ambient, dirLight);

        // Γραμμές δρόμου
        meterPolylines.forEach((line) => {
          const geom = new THREE.BufferGeometry().setFromPoints(
            line.map((p) => new THREE.Vector3(p.x, 0.12, p.z))
          );
          const mat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.72 });
          scene.add(new THREE.Line(geom, mat));
        });

        // Εμπόδια στον δρόμο
        meterObstacles.forEach((obs) => {
          const cone = new THREE.Mesh(
            new THREE.ConeGeometry(0.75, 1.5, 12),
            new THREE.MeshStandardMaterial({ color: 0xff5722 })
          );
          cone.position.set(obs.pos.x, 0.75, obs.pos.z);
          scene.add(cone);
        });

        // --- ΣΠΟΡ ΜΠΛΕ ΚΑΜΠΡΙΟ ΜΕ 2 ΛΕΥΚΕΣ ΡΙΓΕΣ & ΜΑΚΡΙΑ ΜΟΥΡΗ ---
        carGroup = new THREE.Group();
        bodyTiltGroup = new THREE.Group();
        carGroup.add(bodyTiltGroup);

        const blueMat = new THREE.MeshStandardMaterial({ color: 0x005ca9, roughness: 0.16, metalness: 0.42 });
        const whiteStripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
        const chromeMat = new THREE.MeshStandardMaterial({ color: 0xeef2f5, roughness: 0.15, metalness: 0.88 });
        const interiorMat = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.8 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 0.6 });
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x99e6ff, transparent: true, opacity: 0.42 });

        const s = new THREE.Shape();
        s.moveTo(-0.56, -1.78);
        s.quadraticCurveTo(0, -1.9, 0.56, -1.78);
        s.quadraticCurveTo(0.76, -1.4, 0.76, -0.35);
        s.lineTo(0.74, 0.72);
        s.quadraticCurveTo(0.72, 1.18, 0.44, 1.26);
        s.quadraticCurveTo(0, 1.32, -0.44, 1.26);
        s.quadraticCurveTo(-0.72, 1.18, -0.74, 0.72);
        s.lineTo(-0.76, -0.35);
        s.quadraticCurveTo(-0.76, -1.4, -0.56, -1.78);

        const bodyGeom = new THREE.ExtrudeGeometry(s, {
          depth: 0.24,
          bevelEnabled: true,
          bevelSegments: 7,
          steps: 1,
          bevelSize: 0.08,
          bevelThickness: 0.07
        });
        bodyGeom.rotateX(Math.PI / 2);
        const mainBody = new THREE.Mesh(bodyGeom, blueMat);
        mainBody.position.set(0, 0.44, 0);
        bodyTiltGroup.add(mainBody);

        // Μακρύ καπό & 2 λευκές ρίγες
        const hoodGeom = new THREE.SphereGeometry(0.66, 28, 18);
        hoodGeom.scale(0.98, 0.2, 1.75);
        const hood = new THREE.Mesh(hoodGeom, blueMat);
        hood.position.set(0, 0.47, -0.72);

        const stripeGeom = new THREE.BoxGeometry(0.14, 0.025, 1.22);
        const stripeL = new THREE.Mesh(stripeGeom, whiteStripeMat);
        stripeL.position.set(-0.15, 0.595, -1.08);
        stripeL.rotation.x = 0.055;
        const stripeR = new THREE.Mesh(stripeGeom, whiteStripeMat);
        stripeR.position.set(0.15, 0.595, -1.08);
        stripeR.rotation.x = 0.055;
        bodyTiltGroup.add(hood, stripeL, stripeR);

        // Μαζεμένος στρογγυλεμένος κώλος & 2 κόκκινα φανάρια
        const rearDeckGeom = new THREE.SphereGeometry(0.62, 24, 16);
        rearDeckGeom.scale(0.98, 0.2, 0.82);
        const rearDeck = new THREE.Mesh(rearDeckGeom, blueMat);
        rearDeck.position.set(0, 0.48, 0.82);

        redLightMat = new THREE.MeshStandardMaterial({
          color: 0xff1744,
          emissive: 0xff0000,
          emissiveIntensity: 0.45
        });
        const tailGeom = new THREE.CylinderGeometry(0.095, 0.095, 0.06, 18);
        tailGeom.rotateX(Math.PI / 2);
        const tailRingGeom = new THREE.TorusGeometry(0.095, 0.015, 8, 18);

        const tailL = new THREE.Mesh(tailGeom, redLightMat);
        tailL.position.set(-0.36, 0.45, 1.29);
        const ringL = new THREE.Mesh(tailRingGeom, chromeMat);
        ringL.position.set(-0.36, 0.45, 1.31);

        const tailR = new THREE.Mesh(tailGeom, redLightMat);
        tailR.position.set(0.36, 0.45, 1.29);
        const ringR = new THREE.Mesh(tailRingGeom, chromeMat);
        ringR.position.set(0.36, 0.45, 1.31);
        bodyTiltGroup.add(rearDeck, tailL, ringL, tailR, ringR);

        // Εμπρός φώτα, σαλόνι, παρμπρίζ, τιμόνι
        const hlGeom = new THREE.SphereGeometry(0.09, 14, 14);
        const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff9c4, emissiveIntensity: 0.95 });
        const hlL = new THREE.Mesh(hlGeom, hlMat);
        hlL.position.set(-0.46, 0.42, -1.78);
        const hlR = new THREE.Mesh(hlGeom, hlMat);
        hlR.position.set(0.46, 0.42, -1.78);

        const cabinWell = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.14, 0.98), interiorMat);
        cabinWell.position.set(0, 0.36, 0.16);
        const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.24, 0.14), interiorMat);
        seatBack.position.set(0, 0.5, 0.52);
        seatBack.rotation.x = -0.25;

        const hoopGeom = new THREE.TorusGeometry(0.14, 0.024, 8, 16, Math.PI);
        const hoopL = new THREE.Mesh(hoopGeom, chromeMat);
        hoopL.position.set(-0.26, 0.65, 0.56);
        const hoopR = new THREE.Mesh(hoopGeom, chromeMat);
        hoopR.position.set(0.26, 0.65, 0.56);

        const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.24, 0.035), glassMat);
        windshield.position.set(0, 0.62, -0.34);
        windshield.rotation.x = -0.58;
        const topFrame = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.2, 12), chromeMat);
        topFrame.rotation.z = Math.PI / 2;
        topFrame.position.set(0, 0.72, -0.27);

        steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.026, 8, 16), darkMat);
        steeringWheel.position.set(0, 0.6, -0.14);
        steeringWheel.rotation.x = -0.55;

        bodyTiltGroup.add(hlL, hlR, cabinWell, seatBack, hoopL, hoopR, windshield, topFrame, steeringWheel);

        // Φτερά & 4 Ρόδες
        const archGeom = new THREE.TorusGeometry(0.32, 0.06, 10, 20, Math.PI);
        archGeom.rotateY(Math.PI / 2);
        const wheelCoords = [
          [-0.73, -1.08],
          [0.73, -1.08],
          [-0.73, 0.78],
          [0.73, 0.78]
        ];
        const wheels = wheelCoords.map(([wx, wz]) => {
          const arch = new THREE.Mesh(archGeom, blueMat);
          arch.position.set(wx * 0.97, 0.27, wz);
          bodyTiltGroup.add(arch);

          const wGroup = new THREE.Group();
          const tire = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.08, 12, 24), darkMat);
          tire.rotation.y = Math.PI / 2;
          const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.14, 14), chromeMat);
          rim.rotation.z = Math.PI / 2;
          wGroup.add(tire, rim);
          wGroup.position.set(wx, 0.27, wz);
          carGroup.add(wGroup);
          return wGroup;
        });

        wheelFL = wheels[0];
        wheelFR = wheels[1];
        wheelBL = wheels[2];
        wheelBR = wheels[3];
        scene.add(carGroup);

        // --- ΟΔΗΓΟΣ MAGDEBURG #9 (ΧΑΜΗΛΑ ΣΤΟ ΚΑΘΙΣΜΑ) ---
        riderGroup = new THREE.Group();
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#005ca9';
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 42, 256);
        ctx.fillRect(214, 0, 42, 256);
        ctx.font = 'bold 120px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('9', 128, 175);
        const jerseyTex = new THREE.CanvasTexture(canvas);

        const torso = new THREE.Mesh(
          new THREE.BoxGeometry(0.44, 0.54, 0.24),
          new THREE.MeshStandardMaterial({ map: jerseyTex })
        );
        torso.position.set(0, 0.95, 0.18);

        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 16, 16),
          new THREE.MeshStandardMaterial({ color: 0xf1c27d })
        );
        head.position.set(0, 1.38, 0.15);

        const armMat = new THREE.MeshStandardMaterial({ color: 0x005ca9 });
        const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.42), armMat);
        leftArm.position.set(-0.22, 0.92, -0.02);
        leftArm.rotation.x = Math.PI / 2.4;
        const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.42), armMat);
        rightArm.position.set(0.22, 0.92, -0.02);
        rightArm.rotation.x = Math.PI / 2.4;

        const legMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.54), legMat);
        leftLeg.position.set(-0.14, 0.58, 0.08);
        rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.54), legMat);
        rightLeg.position.set(0.14, 0.58, 0.08);

        riderGroup.add(torso, head, leftArm, rightArm, leftLeg, rightLeg);
        scene.add(riderGroup);
        setStatusText(hasStreets ? 'Γκάζωσε πάνω στις γραμμές!' : 'Γκάζωσε ελεύθερα!');
      };

      overlay.onContextRestored = ({ gl }) => {
        try {
          renderer = new THREE.WebGLRenderer({
            canvas: gl.canvas,
            context: gl,
            ...gl.getContextAttributes()
          });
          renderer.autoClear = false;
        } catch (err) {
          renderer = null;
          setStatusText('Το 3D δεν υποστηρίζεται σε αυτή τη συσκευή.');
        }
      };

      const smokeGeom = new THREE.SphereGeometry(0.22, 8, 8);
      const skidGeom = new THREE.PlaneGeometry(0.24, 0.55);
      skidGeom.rotateX(-Math.PI / 2);

      const spawnSmokeAndSkids = (carPos, heading, isBrakingOrReversing) => {
        const rearOffsets = [-0.68, 0.68];
        const sinH = Math.sin(heading);
        const cosH = Math.cos(heading);

        rearOffsets.forEach((sideX) => {
          const wx = carPos.x + sideX * cosH + 0.78 * sinH;
          const wz = carPos.z - sideX * sinH + 0.78 * cosH;

          const sMat = new THREE.MeshBasicMaterial({
            color: isBrakingOrReversing ? 0xd0d0d0 : 0xf5f5f5,
            transparent: true,
            opacity: 0.55
          });
          const puff = new THREE.Mesh(smokeGeom, sMat);
          puff.position.set(wx + (Math.random() - 0.5) * 0.2, 0.22, wz + (Math.random() - 0.5) * 0.2);
          scene.add(puff);
          smokeParticles.push({
            mesh: puff,
            velY: 0.9 + Math.random() * 0.7,
            life: 0.65
          });

          const kMat = new THREE.MeshBasicMaterial({
            color: 0x0d0d0d,
            transparent: true,
            opacity: 0.52,
            depthWrite: false
          });
          const mark = new THREE.Mesh(skidGeom, kMat);
          mark.position.set(wx, 0.04, wz);
          mark.rotation.y = heading;
          scene.add(mark);
          skidMarks.push({ mesh: mark, life: 3.5 });

          if (skidMarks.length > 140) {
            const oldest = skidMarks.shift();
            scene.remove(oldest.mesh);
          }
        });
      };

      let lastTime = performance.now();

      overlay.onDraw = ({ gl, transformer }) => {
        if (!renderer) return;
        const now = performance.now();
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        // Καπνός & ίχνη
        for (let i = smokeParticles.length - 1; i >= 0; i--) {
          const p = smokeParticles[i];
          p.life -= dt;
          if (p.life <= 0) {
            scene.remove(p.mesh);
            smokeParticles.splice(i, 1);
          } else {
            p.mesh.position.y += p.velY * dt;
            p.mesh.scale.addScalar(2.4 * dt);
            p.mesh.material.opacity = (p.life / 0.65) * 0.55;
          }
        }

        for (let i = skidMarks.length - 1; i >= 0; i--) {
          const k = skidMarks[i];
          k.life -= dt;
          if (k.life <= 0) {
            scene.remove(k.mesh);
            skidMarks.splice(i, 1);
          } else if (k.life < 1.0) {
            k.mesh.material.opacity = k.life * 0.52;
          }
        }

        let throttle = throttleRef.current;
        let steer = steerRef.current;
        if (keysRef.current['KeyW'] || keysRef.current['ArrowUp']) throttle = 1;
        if (keysRef.current['KeyS'] || keysRef.current['ArrowDown']) throttle = -1;
        if (keysRef.current['KeyA'] || keysRef.current['ArrowLeft']) steer = -1;
        if (keysRef.current['KeyD'] || keysRef.current['ArrowRight']) steer = 1;

        if (state.mode === 'DRIVING') {
          // --- ΣΤΑΔΙΑΚΗ ΕΠΙΤΑΧΥΝΣΗ: 0..3s (x1) -> +2s (x1.5) -> +2s (x2) -> +2s (x3) -> (x4) ---
          if (throttle > 0.15 && state.speed >= -0.5) {
            state.throttleHoldTime += dt * throttle;
          } else {
            state.throttleHoldTime = Math.max(0, state.throttleHoldTime - dt * 2.8);
          }

          let boostMult = 1;
          let boostTier = 1;
          if (state.throttleHoldTime >= 9.0) {
            boostMult = 4.0;
            boostTier = 5;
          } else if (state.throttleHoldTime >= 7.0) {
            boostMult = 3.0;
            boostTier = 4;
          } else if (state.throttleHoldTime >= 5.0) {
            boostMult = 2.0;
            boostTier = 3;
          } else if (state.throttleHoldTime >= 3.0) {
            boostMult = 1.5;
            boostTier = 2;
          }

          const surged = boostTier > state.prevBoostTier;
          if (surged) {
            soundEngine.playBoostSurge(boostTier);
          }
          state.prevBoostTier = boostTier;
          state.boostMultiplier = boostMult;

          // Βασική ταχύτητα 9.5 m/s * πολλαπλασιαστής (έως 38 m/s στο x4)
          const baseCruiseSpeed = 9.5;
          const maxPossibleSpeed = baseCruiseSpeed * 4.0;
          const targetSpeed = throttle > 0
            ? throttle * baseCruiseSpeed * boostMult
            : throttle * 11.5;

          const prevSpeed = state.speed;
          // Ομαλό γέμισμα στα πρώτα 3 δευτερόλεπτα και δυναμικό άνοιγμα στα boosts
          const accelRate = throttle < 0 ? 4.2 : (boostMult > 1 ? 2.4 : 1.15);
          state.speed = THREE.MathUtils.lerp(state.speed, targetSpeed, accelRate * dt);
          const accel = (state.speed - prevSpeed) / Math.max(dt, 0.001);

          // Υπολογισμός 6 ταχυτήτων (1η έως 6η)
          const absSpeed = Math.abs(state.speed);
          state.gear = Math.min(6, Math.max(1, Math.floor((absSpeed / maxPossibleSpeed) * 6) + 1));

          const targetSteer = -steer * 1.15;
          state.steerAngle = THREE.MathUtils.lerp(state.steerAngle, targetSteer, 5.2 * dt);

          if (Math.abs(state.speed) > 0.1) {
            const dirSign = state.speed >= 0 ? 1 : -1;
            state.carHeading += state.steerAngle * dirSign * dt;
          }

          state.carPos.x -= Math.sin(state.carHeading) * state.speed * dt;
          state.carPos.z -= Math.cos(state.carHeading) * state.speed * dt;

          // 2 πίσω κόκκινα φανάρια στο φρενάρισμα ή όπισθεν
          const isBraking = (state.speed > 1.5 && throttle < -0.15) || (state.speed < -1.5 && throttle > 0.15);
          const isReversing = throttle < -0.15 || state.speed < -0.5;
          const isHardAccelerating = (throttle > 0.45 && accel > 3.2) || surged;

          if (isBraking || isReversing) {
            redLightMat.emissiveIntensity = 3.2;
            redLightMat.color.setHex(0xff5252);
          } else {
            redLightMat.emissiveIntensity = 0.4;
            redLightMat.color.setHex(0xb71c1c);
          }

          // Καπνός & ίχνη
          const isSliding = isHardAccelerating || isBraking;
          skidTimer += dt;
          if (isSliding && skidTimer > 0.035) {
            skidTimer = 0;
            spawnSmokeAndSkids(state.carPos, state.carHeading, isBraking);
          }

          // Ενημέρωση ήχου κινητήρα & σπινιαρίσματος
          soundEngine.updateVehicleAudio({
            speed: state.speed,
            maxSpeed: maxPossibleSpeed,
            gear: state.gear,
            boostMultiplier: boostMult,
            throttle,
            isSliding
          });

          // Κλίση αμαξώματος (body roll & pitch)
          const speedRatio = Math.min(1, absSpeed / 24);
          const targetRoll = -state.steerAngle * speedRatio * 0.14;
          const targetPitch = THREE.MathUtils.clamp(accel * 0.0045, -0.075, 0.075);

          bodyTiltGroup.rotation.z = THREE.MathUtils.lerp(bodyTiltGroup.rotation.z, targetRoll, 8 * dt);
          bodyTiltGroup.rotation.x = THREE.MathUtils.lerp(bodyTiltGroup.rotation.x, targetPitch, 8 * dt);

          // Περιστροφή ρόδων & τιμονιού
          const wheelSpin = state.speed * dt * 3.4;
          wheelFL.rotation.x -= wheelSpin;
          wheelFR.rotation.x -= wheelSpin;
          wheelBL.rotation.x -= wheelSpin;
          wheelBR.rotation.x -= wheelSpin;
          wheelFL.rotation.y = state.steerAngle * 0.35;
          wheelFR.rotation.y = state.steerAngle * 0.35;
          steeringWheel.rotation.z = state.steerAngle * 1.4;

          carGroup.position.copy(state.carPos);
          carGroup.rotation.set(0, state.carHeading, 0);

          riderGroup.position.set(state.carPos.x, state.carPos.y - 0.22, state.carPos.z);
          riderGroup.rotation.set(
            bodyTiltGroup.rotation.x,
            state.carHeading,
            bodyTiltGroup.rotation.z
          );
          leftLeg.rotation.x = Math.PI / 2.2;
          rightLeg.rotation.x = Math.PI / 2.2;

          // Περιοδική ενημέρωση HUD (ταχύτητα & boost)
          hudUpdateTimer += dt;
          if (hudUpdateTimer > 0.12) {
            hudUpdateTimer = 0;
            setHudStats({
              gear: state.gear,
              boost: `x${boostMult}`,
              kmh: Math.round(absSpeed * 3.6)
            });
          }

          // Έλεγχος ορίων δρόμου
          const check = evaluateStreetBounds(state.carPos);
          if (check.valid) {
            state.safeCenter.copy(check.nearest);
            state.safeHeading = check.heading;
          } else {
            state.mode = 'FLYING';
            setStatusText('Τράκαρες! Ο οδηγός εκτινάχθηκε!');
            redLightMat.emissiveIntensity = 3.2;
            soundEngine.playCrashLaunch();
            soundEngine.updateVehicleAudio({
              speed: 0,
              maxSpeed: maxPossibleSpeed,
              gear: 1,
              boostMultiplier: 1,
              throttle: 0,
              isSliding: false
            });

            state.riderPos.copy(state.carPos);
            state.riderPos.y = 0.9;

            const launchSpeed = Math.max(15, absSpeed * 1.15);
            state.riderVel.set(
              -Math.sin(state.carHeading) * launchSpeed + (Math.random() - 0.5) * 6,
              12.5,
              -Math.cos(state.carHeading) * launchSpeed + (Math.random() - 0.5) * 6
            );
            state.riderSpin.set(7, 5, 6);
            state.speed = 0;
            state.throttleHoldTime = 0;
            state.boostMultiplier = 1;
            state.prevBoostTier = 1;
            bodyTiltGroup.rotation.z = 0.14;
          }
        } else if (state.mode === 'FLYING') {
          state.riderVel.y -= 18 * dt;
          state.riderPos.addScaledVector(state.riderVel, dt);
          riderGroup.position.copy(state.riderPos);
          riderGroup.rotation.x += state.riderSpin.x * dt;
          riderGroup.rotation.z += state.riderSpin.z * dt;
          leftLeg.rotation.x = Math.sin(now * 0.025) * 1.1;
          rightLeg.rotation.x = -Math.sin(now * 0.025) * 1.1;

          if (state.riderPos.y <= 0) {
            state.riderPos.y = 0;
            state.mode = 'WALKING';
            riderGroup.rotation.set(0, 0, 0);
            setStatusText('Επιστρέφει στο κάμπριο...');
          }
        } else if (state.mode === 'WALKING') {
          const toCar = new THREE.Vector3().subVectors(state.carPos, state.riderPos);
          const dist = toCar.length();

          if (dist > 0.9) {
            toCar.normalize();
            state.riderPos.addScaledVector(toCar, 5.5 * dt);
            riderGroup.position.copy(state.riderPos);
            riderGroup.rotation.y = Math.atan2(-toCar.x, -toCar.z);
            leftLeg.rotation.x = Math.sin(now * 0.018) * 0.75;
            rightLeg.rotation.x = -Math.sin(now * 0.018) * 0.75;
          } else {
            state.carPos.copy(state.safeCenter);
            state.carHeading = state.safeHeading;
            bodyTiltGroup.rotation.set(0, 0, 0);
            state.mode = 'DRIVING';
            setStatusText(hasStreets ? 'Γκάζωσε πάνω στις γραμμές!' : 'Γκάζωσε ελεύθερα!');
          }
        }

        // Κάμερα 67° από 12μ ύψος
        const R = 6378137;
        const carLat = origin.lat - (state.carPos.z / R) * (180 / Math.PI);
        const carLng = origin.lng + (state.carPos.x / (R * Math.cos(THREE.MathUtils.degToRad(origin.lat)))) * (180 / Math.PI);
        const mapHeadingDeg = (-THREE.MathUtils.radToDeg(state.carHeading) + 360) % 360;

        sampleElevation(carLat, carLng);
        map.moveCamera({
          center: { lat: carLat, lng: carLng },
          heading: mapHeadingDeg,
          tilt: 67,
          zoom: initialZoom
        });

        // Anchor the projection AT THE CAR on the terrain's own elevation and
        // shift the whole scene so the car is the local origin. The car then
        // stays glued to the road surface at every tilt/heading - no drift,
        // no vertical slide.
        scene.position.set(-state.carPos.x, 0, -state.carPos.z);
        const matrix = transformer.fromLatLngAltitude({
          lat: carLat,
          lng: carLng,
          altitude: groundAltitude
        });
        camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

        overlay.requestRedraw();
        renderer.render(scene, camera);
        renderer.resetState();
      };

      overlay.setMap(map);
      }).catch(() => {
        setStatusText('Δεν φόρτωσε ο χάρτης. Έλεγξε τη σύνδεση και πάτα Back.');
      });

    const onKeyDown = (e) => {
      unlockAudio();
      keysRef.current[e.code] = true;
    };
    const onKeyUp = (e) => {
      keysRef.current[e.code] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      try { overlay && overlay.setMap(null); } catch {}
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      soundEngine.destroy();
    };
  }, [apiKey, mapId, streetLines, obstacles, laneHalfWidth, initialZoom]);

  const handleLeftMove = (clientY, rect) => {
    unlockAudio();
    const centerY = rect.top + rect.height / 2;
    const maxOffset = rect.height / 2 - 24;
    const clamped = Math.max(-maxOffset, Math.min(maxOffset, clientY - centerY));
    setLeftKnobY(clamped);
    throttleRef.current = -clamped / maxOffset;
  };

  const handleRightMove = (clientX, rect) => {
    unlockAudio();
    const centerX = rect.left + rect.width / 2;
    const maxOffset = rect.width / 2 - 24;
    const clamped = Math.max(-maxOffset, Math.min(maxOffset, clientX - centerX));
    setRightKnobX(clamped);
    steerRef.current = clamped / maxOffset;
  };

  const enterFullScreen = () => {
    unlockAudio();
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    // Landscape lock (Android/Chrome: needs fullscreen, which the tap just
    // requested). iOS has no API - ignored silently there.
    try {
      const lock = screen.orientation && screen.orientation.lock;
      if (lock) { const p = lock('landscape'); if (p && p.catch) p.catch(() => {}); }
    } catch (e) {}
  };

  return (
    <div style={styles.viewport} onPointerDown={unlockAudio}>
      <div style={styles.aspectBox}>
        <div ref={mapDivRef} style={styles.mapCanvas} />

        {onExit && (
          <button onClick={onExit} style={styles.backButton} aria-label="Back">
            ←
          </button>
        )}

        <div style={styles.hudTop}>
          <div style={styles.hudLeftGroup}>
            <span style={styles.badge}>{statusText}</span>
            <span style={styles.gearBadge}>
              G{hudStats.gear}/6 • {hudStats.boost} • {hudStats.kmh} km/h
            </span>
          </div>

          <div style={styles.hudRightGroup}>
            <button onClick={handleToggleAudio} style={styles.fsBtn}>
              {isMuted ? '16-Bit Ήχος: OFF' : '16-Bit Ήχος: ON'}
            </button>
            <button onClick={enterFullScreen} style={styles.fsBtn}>
              Οριζόντια / Fullscreen
            </button>
          </div>
        </div>

        {/* Αριστερό Joystick: Μπροστά / Πίσω */}
        <div
          style={styles.leftController}
          onTouchStart={(e) => handleLeftMove(e.touches[0].clientY, e.currentTarget.getBoundingClientRect())}
          onTouchMove={(e) => handleLeftMove(e.touches[0].clientY, e.currentTarget.getBoundingClientRect())}
          onTouchEnd={() => { setLeftKnobY(0); throttleRef.current = 0; }}
          onMouseDown={(e) => handleLeftMove(e.clientY, e.currentTarget.getBoundingClientRect())}
          onMouseMove={(e) => e.buttons === 1 && handleLeftMove(e.clientY, e.currentTarget.getBoundingClientRect())}
          onMouseUp={() => { setLeftKnobY(0); throttleRef.current = 0; }}
          onMouseLeave={() => { setLeftKnobY(0); throttleRef.current = 0; }}
        >
          <span style={styles.joyLabel}>FRONT</span>
          <div style={{ ...styles.knob, transform: `translateY(${leftKnobY}px)` }} />
          <span style={styles.joyLabel}>BACK</span>
        </div>

        {/* Δεξί Joystick: Αριστερά / Δεξιά */}
        <div
          style={styles.rightController}
          onTouchStart={(e) => handleRightMove(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
          onTouchMove={(e) => handleRightMove(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
          onTouchEnd={() => { setRightKnobX(0); steerRef.current = 0; }}
          onMouseDown={(e) => handleRightMove(e.clientX, e.currentTarget.getBoundingClientRect())}
          onMouseMove={(e) => e.buttons === 1 && handleRightMove(e.clientX, e.currentTarget.getBoundingClientRect())}
          onMouseUp={() => { setRightKnobX(0); steerRef.current = 0; }}
          onMouseLeave={() => { setRightKnobX(0); steerRef.current = 0; }}
        >
          <span style={styles.joyLabel}>LEFT</span>
          <div style={{ ...styles.knob, transform: `translateX(${rightKnobX}px)` }} />
          <span style={styles.joyLabel}>RIGHT</span>
        </div>
      </div>
    </div>
  );
}

const styles = {
backButton: {
  position: 'absolute',
  top: 12,
  left: 12,
  width: 44,
  height: 44,
  borderRadius: '50%',
  border: '1px solid rgba(255,255,255,0.35)',
  background: 'rgba(10,25,40,0.72)',
  color: '#fff',
  fontSize: 22,
  lineHeight: '1',
  cursor: 'pointer',
  zIndex: 5,
},
  viewport: {
    width: '100vw',
    height: '100vh',
    backgroundColor: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    touchAction: 'none',
    userSelect: 'none'
  },
  aspectBox: {
    position: 'relative',
    width: '100%',
    height: '100%',
    maxWidth: '177.78vh',
    maxHeight: '56.25vw',
    overflow: 'hidden'
  },
  mapCanvas: {
    width: '100%',
    height: '100%'
  },
  hudTop: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    pointerEvents: 'none'
  },
  hudLeftGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap'
  },
  hudRightGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    pointerEvents: 'auto'
  },
  badge: {
    background: 'rgba(0, 92, 169, 0.9)',
    color: '#fff',
    padding: '6px 14px',
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 600
  },
  gearBadge: {
    background: 'rgba(15, 23, 42, 0.85)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.45)',
    padding: '6px 12px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700
  },
  fsBtn: {
    pointerEvents: 'auto',
    background: 'rgba(0,0,0,0.75)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 16,
    padding: '6px 12px',
    fontSize: 12,
    cursor: 'pointer'
  },
  leftController: {
    position: 'absolute',
    bottom: 24,
    left: 28,
    width: 68,
    height: 150,
    borderRadius: 34,
    background: 'rgba(255, 255, 255, 0.18)',
    border: '2px solid rgba(255, 255, 255, 0.45)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 0',
    backdropFilter: 'blur(4px)'
  },
  rightController: {
    position: 'absolute',
    bottom: 24,
    right: 28,
    width: 150,
    height: 68,
    borderRadius: 34,
    background: 'rgba(255, 255, 255, 0.18)',
    border: '2px solid rgba(255, 255, 255, 0.45)',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    backdropFilter: 'blur(4px)'
  },
  knob: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: '#005ca9',
    border: '2px solid #ffffff',
    boxShadow: '0 4px 10px rgba(0,0,0,0.4)'
  },
  joyLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5
  }
};

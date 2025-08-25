import * as DOM from "./dom.js";
import { BUTTON_DEPTH, TEXT_Z_OFFSET } from "./config.js";

let scene, camera, renderer, raycaster, mouse;
let activeMaterial, validMaterial, invalidMaterial;
export let wordButtons = [];

function createMaterials() {
  activeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x9b8cff,
    metalness: 0.1,
    roughness: 0.5,
    emissive: 0x6ee7f5,
    emissiveIntensity: 0.5,
    clearcoat: 0.8,
  });
  validMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x4ade80,
    metalness: 0.1,
    roughness: 0.5,
    emissive: 0x4ade80,
    emissiveIntensity: 0.5,
    clearcoat: 0.8,
  });
  invalidMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xff4d6d,
    metalness: 0.1,
    roughness: 0.5,
    emissive: 0xff4d6d,
    emissiveIntensity: 0.5,
    clearcoat: 0.8,
  });
}

export function getMaterials() {
  return { activeMaterial, validMaterial, invalidMaterial };
}

export function initThreeJS() {
  if (scene) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1226);
  renderer = new THREE.WebGLRenderer({
    canvas: DOM.canvas,
    antialias: true,
    alpha: true,
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  camera = new THREE.PerspectiveCamera(
    60,
    DOM.canvas.clientWidth / Math.max(1, DOM.canvas.clientHeight),
    0.1,
    1000,
  );
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, 0);

  const ambientLight = new THREE.AmbientLight(0x6ee7f5, 0.45);
  scene.add(ambientLight);
  const dir = new THREE.DirectionalLight(0x9b8cff, 0.9);
  dir.position.set(5, 10, 5);
  dir.castShadow = true;
  scene.add(dir);

  createMaterials();

  // --- Camera Controls ---
  let isRot = false,
    rotX = 0,
    rotY = Math.PI / 2,
    camDist = 8;
  let lastTouch = null,
    lastPinch = null;
  const getDist = (a, b) =>
    Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  const handleRot = (dx, dy, s = 0.01) => {
    rotY += dx * s;
    rotX += dy * s;
    rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotX));
  };
  const handleZoom = (d, s = 0.01) => {
    camDist += d * s;
    camDist = Math.max(3, Math.min(20, camDist));
  };

  DOM.canvas.addEventListener("mousedown", (e) => {
    isRot = true;
    lastTouch = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("mouseup", () => {
    isRot = false;
    lastTouch = null;
  });
  DOM.canvas.addEventListener("mousemove", (e) => {
    if (!isRot || !lastTouch) return;
    handleRot(e.clientX - lastTouch.x, e.clientY - lastTouch.y, 0.012);
    lastTouch = { x: e.clientX, y: e.clientY };
  });
  DOM.canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      handleZoom(e.deltaY, 0.015);
    },
    { passive: false },
  );
  DOM.canvas.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 1) {
        isRot = true;
        lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        lastPinch = null;
      }
      if (e.touches.length === 2) {
        isRot = false;
        lastTouch = null;
        lastPinch = getDist(e.touches[0], e.touches[1]);
      }
    },
    { passive: false },
  );
  DOM.canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && isRot && lastTouch) {
        handleRot(
          e.touches[0].clientX - lastTouch.x,
          e.touches[0].clientY - lastTouch.y,
          0.015,
        );
        lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2 && lastPinch !== null) {
        const d = getDist(e.touches[0], e.touches[1]);
        handleZoom(lastPinch - d, 0.02);
        lastPinch = d;
      }
    },
    { passive: false },
  );
  DOM.canvas.addEventListener(
    "touchend",
    (e) => {
      if (e.touches.length === 0) {
        isRot = false;
        lastTouch = null;
        lastPinch = null;
      } else if (e.touches.length === 1) {
        isRot = true;
        lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        lastPinch = null;
      }
    },
    { passive: false },
  );

  const resize = () => {
    const w = DOM.canvas.clientWidth,
      h = Math.max(2, DOM.canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(DOM.canvasContainer);
  resize();

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  const animate = () => {
    requestAnimationFrame(animate);
    camera.position.x = Math.cos(rotY) * Math.cos(rotX) * camDist;
    camera.position.y = Math.sin(rotX) * camDist;
    camera.position.z = Math.sin(rotY) * Math.cos(rotX) * camDist;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  };
  animate();

  const handleClick = (clientX, clientY) => {
    const rect = DOM.canvas.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(wordButtons, true);
    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj && !obj.onClick && obj.parent) obj = obj.parent;
      if (obj && obj.onClick) {
        obj.onClick();
      }
    }
  };
  DOM.canvas.addEventListener("click", (e) =>
    handleClick(e.clientX, e.clientY),
  );
  DOM.canvas.addEventListener("touchend", (e) => {
    if (e.changedTouches && e.changedTouches.length) {
      handleClick(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
  });
}

function createRoundedButtonGeometry(
  w = 1.9,
  h = 1.2,
  depth = BUTTON_DEPTH,
  r = 0.16,
) {
  const hw = w / 2,
    hh = h / 2,
    radius = Math.min(r, hw, hh);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + radius, -hh);
  shape.lineTo(hw - radius, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + radius);
  shape.lineTo(hw, hh - radius);
  shape.quadraticCurveTo(hw, hh, hw - radius, hh);
  shape.lineTo(-hw + radius, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - radius);
  shape.lineTo(-hw, -hh + radius);
  shape.quadraticCurveTo(-hw, -hh, -hw + radius, -hh);
  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.06,
    bevelSegments: 6,
    curveSegments: 32,
  });
  if (extrude.center) extrude.center();
  return extrude;
}

function makeFittedTextMesh(word, planeW = 1.6, planeH = 0.78) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const baseW = 1024,
    baseH = 512;
  const tex = document.createElement("canvas");
  tex.width = Math.floor(baseW * dpr);
  tex.height = Math.floor(baseH * dpr);
  const ctx = tex.getContext("2d", { alpha: true });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pad = 28,
    maxW = baseW - pad * 2,
    maxH = baseH - pad * 2;
  let fs = 120;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  while (fs > 10) {
    ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`;
    if (ctx.measureText(word).width <= maxW && fs * 1.1 <= maxH) break;
    fs -= 2;
  }
  ctx.clearRect(0, 0, baseW, baseH);
  ctx.shadowColor = "rgba(110,231,245,0.14)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "#e8ebff";
  ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`;
  ctx.fillText(word, baseW / 2, baseH / 2);
  const texture = new THREE.CanvasTexture(tex);
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const geo = new THREE.PlaneGeometry(planeW, planeH);
  return new THREE.Mesh(geo, mat);
}

function createWordButton(word, position, index) {
  const g = new THREE.Group();
  const geom = createRoundedButtonGeometry(1.9, 1.2, BUTTON_DEPTH, 0.18);
  const baseMat = new THREE.MeshPhysicalMaterial({
    color: 0x161a36,
    metalness: 0.05,
    roughness: 0.6,
    clearcoat: 0.6,
    clearcoatRoughness: 0.4,
    opacity: 0.98,
    transparent: true,
  });
  const btn = new THREE.Mesh(geom, baseMat);
  btn.castShadow = true;
  btn.receiveShadow = true;
  g.add(btn);
  const textMesh = makeFittedTextMesh(word, 1.6, 0.78);
  textMesh.position.z = BUTTON_DEPTH / 2 + TEXT_Z_OFFSET;
  g.add(textMesh);
  g.position.set(position.x, position.y, position.z);
  g.userData = {
    word,
    index,
    baseMaterial: baseMat,
    textMesh,
    buttonMesh: btn,
  };
  return g;
}

function generatePositions(dimensions, size) {
  if (dimensions <= 3) dimensions = 3;
  const positions = [];
  const pointSpacing = 2.5,
    cubeMargin = 5.0;
  const sideLength = Math.ceil(Math.pow(size, 1 / dimensions));
  const cubeWidth = (sideLength - 1) * pointSpacing;
  const gridSpacing = cubeWidth + cubeMargin;
  for (let i = 0; i < size; i++) {
    const coords = [];
    let temp_i = i;
    for (let d = 0; d < dimensions; d++) {
      coords.push(temp_i % sideLength);
      temp_i = Math.floor(temp_i / sideLength);
    }
    const centerOffset = (sideLength - 1) / 2.0;
    const localX = (coords[0] - centerOffset) * pointSpacing;
    const localY = (coords[1] - centerOffset) * pointSpacing;
    const localZ = (coords[2] - centerOffset) * pointSpacing;
    let gridOffsetX =
      dimensions > 3 ? (coords[3] - centerOffset) * gridSpacing : 0;
    let gridOffsetY =
      dimensions > 4 ? (coords[4] - centerOffset) * gridSpacing : 0;
    let gridOffsetZ =
      dimensions > 5 ? (coords[5] - centerOffset) * gridSpacing : 0;
    positions.push({
      x: localX + gridOffsetX,
      y: localY + gridOffsetY,
      z: localZ + gridOffsetZ,
    });
  }
  return positions;
}

export function render3DVisualization(wordObjects, numDimensions, on3DClick) {
  initThreeJS();
  wordButtons.forEach((b) => scene.remove(b));
  wordButtons.length = 0;

  let positions = generatePositions(numDimensions, wordObjects.length);
  DOM.dimensionInfo.textContent =
    numDimensions === 3 ? `3D Kubus` : `${numDimensions}D Hyperkubus`;

  wordObjects.forEach((wordObject, i) => {
    if (i < positions.length) {
      const btn = createWordButton(
        wordObject.word,
        positions[i],
        wordObject.index,
      );
      btn.onClick = () => on3DClick(wordObject.word, btn);
      scene.add(btn);
      wordButtons.push(btn);
    }
  });
}

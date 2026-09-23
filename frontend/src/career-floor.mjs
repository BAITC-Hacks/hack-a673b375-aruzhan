// The scene is an alternative navigation surface. Eligibility and progress stay in domain code.
const GREEN = "#00805F";
const GOLD = "#FAAE17";
const WHITE = "#FFFFFF";
const MUTED = "#B6C5BF";

export async function createCareerFloor(container, { onSelect = () => {}, onAvailability = () => {} } = {}) {
  const fallback = { available: false, update() {}, rotate() {}, destroy() {} };
  let THREE;
  let renderer;
  try {
    THREE = await import("/vendor/three/three.module.js");
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    renderer?.dispose();
    onAvailability(false);
    return fallback;
  }

  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:pan-y;";
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor("#F5F8F6", 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-6, 6, 4, -4, 0.1, 80);
  const floor = new THREE.Group();
  const choices = new THREE.Group();
  scene.add(floor, choices);
  scene.add(new THREE.HemisphereLight(WHITE, "#C4D4CB", 2.4));
  const sunlight = new THREE.DirectionalLight(WHITE, 2.3);
  sunlight.position.set(-4, 10, 6);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  Object.assign(sunlight.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 30 });
  sunlight.shadow.normalBias = 0.04;
  sunlight.shadow.bias = -0.0001;
  scene.add(sunlight);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const nodes = new Map();
  let currentModel = { steps: [], selectedId: null, previewId: null, hasGoal: false };
  let signature = "";
  let angle = Math.PI / 4;
  let frame = 0;
  let previewStarted = 0;
  let previewNode = null;
  let destroyed = false;
  let available = true;
  let pointerStart = null;

  function material(color) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0 });
  }

  function mesh(parent, geometry, color, x = 0, y = 0, z = 0) {
    const object = new THREE.Mesh(geometry, material(color));
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function box(parent, width, height, depth, color, x = 0, y = 0, z = 0) {
    return mesh(parent, new THREE.BoxGeometry(width, height, depth), color, x, y, z);
  }

  function ring(parent, radius, color, y) {
    const object = mesh(parent, new THREE.TorusGeometry(radius, 0.035, 8, 40), color, 0, y, 0);
    object.rotation.x = Math.PI / 2;
    return object;
  }

  function badge(parent, text, y, color = GREEN) {
    const image = document.createElement("canvas");
    image.width = image.height = 128;
    const context = image.getContext("2d");
    if (!context) return;
    context.fillStyle = WHITE;
    context.beginPath();
    context.arc(64, 64, 52, 0, Math.PI * 2);
    context.fill();
    context.lineWidth = 5;
    context.strokeStyle = color;
    context.stroke();
    context.fillStyle = color;
    context.font = "700 62px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 64, 67);
    const texture = new THREE.CanvasTexture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: true }));
    sprite.position.set(0, y, 0);
    sprite.scale.set(0.55, 0.55, 1);
    parent.add(sprite);
  }

  function route(points, color, dashed = false) {
    const vectors = points.map(([x, z]) => new THREE.Vector3(x, 0.11, z));
    for (let index = 1; index < vectors.length; index += 1) {
      const start = vectors[index - 1];
      const end = vectors[index];
      const distance = start.distanceTo(end);
      const segments = Math.ceil(distance / 0.23);
      for (let part = 0; part < segments; part += 1) {
        if (dashed && part % 2) continue;
        const point = start.clone().lerp(end, (part + 0.5) / segments);
        const tile = box(choices, 0.13, 0.035, distance / segments * (dashed ? 0.65 : 1.05), color, point.x, point.y, point.z);
        tile.rotation.y = Math.atan2(end.x - start.x, end.z - start.z);
        tile.castShadow = false;
      }
    }
  }

  function disposeGroup(group) {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    group.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) {
        for (const item of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(item);
          if (item.map) textures.add(item.map);
        }
      }
    });
    textures.forEach(item => item.dispose());
    materials.forEach(item => item.dispose());
    geometries.forEach(item => item.dispose());
    group.clear();
  }

  // An architectural base with individual floor tiles, rather than a floating graph.
  box(floor, 7.65, 0.2, 5.85, "#E0E8E3", 0, -0.19, 0);
  const tileGeometry = new THREE.BoxGeometry(0.9, 0.09, 0.9);
  const tileMaterial = material("#FCFDFC");
  for (let x = 0; x < 8; x += 1) {
    for (let z = 0; z < 6; z += 1) {
      const tile = new THREE.Mesh(tileGeometry, tileMaterial);
      tile.position.set((x - 3.5) * 0.94, -0.025, (z - 2.5) * 0.94);
      tile.receiveShadow = true;
      floor.add(tile);
    }
  }
  const ground = mesh(floor, new THREE.PlaneGeometry(200, 200), "#F5F8F6", 0, -0.31, 0);
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;

  function rebuild(model) {
    disposeGroup(choices);
    nodes.clear();
    const origin = [-2.65, 1.85];
    const destination = [2.5, -1.75];
    const employee = new THREE.Group();
    employee.position.set(origin[0], 0, origin[1]);
    choices.add(employee);
    mesh(employee, new THREE.CylinderGeometry(0.4, 0.43, 0.12, 32), WHITE, 0, 0.12);
    ring(employee, 0.36, GREEN, 0.2);
    mesh(employee, new THREE.CylinderGeometry(0.12, 0.19, 0.4, 24), GREEN, 0, 0.44);
    mesh(employee, new THREE.SphereGeometry(0.16, 24, 16), GREEN, 0, 0.8);

    const goal = new THREE.Group();
    goal.position.set(destination[0], 0, destination[1]);
    choices.add(goal);
    box(goal, 1.3, 0.2, 1.3, model.hasGoal ? GOLD : MUTED, 0, 0.13);
    box(goal, 1.05, 0.65, 1.05, WHITE, 0, 0.5);
    box(goal, 1.15, 0.07, 1.15, model.hasGoal ? GOLD : MUTED, 0, 0.86);
    mesh(goal, new THREE.CylinderGeometry(0.025, 0.025, 1.2, 12), GREEN, -0.22, 1.49, 0);
    const flag = new THREE.Shape();
    flag.moveTo(0, 0); flag.lineTo(0.72, -0.09); flag.lineTo(0.55, -0.28); flag.lineTo(0.72, -0.46); flag.lineTo(0, -0.46);
    const flagMesh = mesh(goal, new THREE.ShapeGeometry(flag), model.hasGoal ? GOLD : MUTED, -0.22, 2.07, 0);
    flagMesh.material.side = THREE.DoubleSide;

    const eligible = model.steps.filter(step => step.kind === "eligible").slice(0, 3);
    const locked = model.steps.find(step => step.kind === "locked");
    const coordinates = eligible.length === 1 ? [[-0.25, 0]]
      : eligible.length === 2 ? [[-1.3, -0.45], [1.35, 0.6]]
        : [[-1.7, -0.65], [0.15, 0.15], [2.05, 1.05]];
    eligible.forEach((step, index) => {
      const [x, z] = coordinates[index];
      // Each route is an independent choice leading toward the same goal.
      route([origin, [-2.65, 0.9], [x, z]], GREEN);
      if (model.hasGoal) route([[x, z], [x, -1.75], destination], "#BDDACB", true);
      checkpoint(step, x, z, String.fromCharCode(65 + index));
    });
    if (locked) {
      route([origin, [-3, 0.7], [-3, -1.4]], MUTED, true);
      checkpoint(locked, -3, -1.4, "–");
    }
  }

  function checkpoint(step, x, z, letter) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    choices.add(group);
    const locked = step.kind === "locked";
    const base = box(group, 0.95, 0.18, 0.95, locked ? "#E8ECE9" : WHITE, 0, 0.17);
    const marker = ring(group, 0.33, locked ? MUTED : GREEN, 0.29);
    mesh(group, new THREE.CylinderGeometry(0.24, 0.29, 0.14, 32), locked ? "#CCD5D0" : GREEN, 0, 0.34);
    badge(group, letter, 0.86, locked ? "#72857C" : GREEN);
    group.traverse(object => { object.userData.stepId = step.id; });
    nodes.set(step.id, { group, base, marker, locked });
  }

  function updateCamera() {
    camera.position.set(Math.sin(angle) * 12, 10, Math.cos(angle) * 12);
    camera.lookAt(0, 0.35, 0);
    camera.updateProjectionMatrix();
  }

  function render(now = performance.now()) {
    frame = 0;
    if (destroyed || !available) return;
    if (previewNode) {
      const elapsed = Math.min((now - previewStarted) / 900, 1);
      const lift = Math.sin(elapsed * Math.PI) * 0.33;
      previewNode.group.position.y = lift + (currentModel.selectedId === currentModel.previewId ? 0.07 : 0);
      previewNode.marker.material.color.set(elapsed < 1 ? GOLD : GREEN);
      if (elapsed < 1) frame = requestAnimationFrame(render);
      else previewNode = null;
    }
    renderer.render(scene, camera);
  }

  function requestRender() {
    if (!destroyed && available && !frame) frame = requestAnimationFrame(render);
  }

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height || destroyed) return;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const visibleHeight = Math.max(7.6, 11.5 / aspect);
    camera.left = -visibleHeight * aspect / 2;
    camera.right = visibleHeight * aspect / 2;
    camera.top = visibleHeight / 2;
    camera.bottom = -visibleHeight / 2;
    updateCamera();
    requestRender();
  }

  function update(model) {
    if (destroyed || !available) return;
    const previousPreview = currentModel.previewId;
    currentModel = model;
    if (model.previewId !== previousPreview) previewNode = null;
    const nextSignature = JSON.stringify([model.hasGoal, model.steps.map(step => [step.id, step.kind])]);
    if (signature !== nextSignature) {
      previewNode = null;
      rebuild(model);
      signature = nextSignature;
    }
    for (const [id, node] of nodes) {
      node.group.position.y = id === model.selectedId ? 0.07 : 0;
      node.base.material.color.set(node.locked ? "#E8ECE9" : id === model.selectedId ? "#E3F2EA" : WHITE);
      node.marker.material.color.set(node.locked ? MUTED : reducedMotion.matches && id === model.previewId ? GOLD : GREEN);
    }
    if (model.previewId && model.previewId !== previousPreview && !reducedMotion.matches) {
      const node = nodes.get(model.previewId);
      if (node && !node.locked) { previewNode = node; previewStarted = performance.now(); }
    }
    if (reducedMotion.matches) previewNode = null;
    requestRender();
  }

  function hit(event) {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects([...nodes.values()].map(node => node.group), true)[0]?.object.userData.stepId ?? null;
  }

  function pointerDown(event) { pointerStart = { x: event.clientX, y: event.clientY }; }
  function pointerUp(event) {
    if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 8) { pointerStart = null; return; }
    pointerStart = null;
    const id = hit(event);
    if (id) onSelect(id);
  }
  function pointerMove(event) { canvas.style.cursor = hit(event) ? "pointer" : "default"; }
  function contextLost(event) {
    event.preventDefault();
    available = false;
    cancelAnimationFrame(frame);
    onAvailability(false);
  }
  function motionChanged() { update(currentModel); }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("webglcontextlost", contextLost);
  reducedMotion.addEventListener("change", motionChanged);
  resize();
  update(currentModel);
  onAvailability(true);

  return {
    get available() { return available && !destroyed; },
    update,
    rotate(direction) {
      if (destroyed || !available) return;
      angle += (direction === "left" || Number(direction) < 0 ? -1 : 1) * Math.PI / 8;
      updateCamera();
      requestRender();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("webglcontextlost", contextLost);
      reducedMotion.removeEventListener("change", motionChanged);
      disposeGroup(floor);
      disposeGroup(choices);
      sunlight.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      nodes.clear();
    }
  };
}

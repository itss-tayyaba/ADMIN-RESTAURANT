// ============================================================
// Ember & Brew — Three.js GLB Dish Viewer
// Uses ONLY the real .glb models supplied for the menu.
// No procedural dish generation and no placeholder geometry.
// ============================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODELS_BASE = '/models/';
const gltfLoader = new GLTFLoader();
const modelCache = new Map();

const MODEL_FILES = {
  'Espresso': 'Meshy_AI_Coffee_Hearts_0811083841_texture.glb',
  'Mocha': 'Meshy_AI_Mocha_Bloom_0811152959_texture.glb',
  'Cappuccino': 'Meshy_AI_Coffee_Hearts_0811083841_texture.glb',
  'Matcha Latte': 'Meshy_AI_Iced_Matcha_Latte_0811145306_texture.glb',
  'Butter Croissant': 'Meshy_AI_Golden_Morning_Croiss_0811082947_texture.glb',
  'Almond Danish': 'Meshy_AI_Rustic_Cherry_Puff_Pa_0811075937_texture.glb',
  'Blueberry Muffin': 'Meshy_AI_Blueberry_Crumble_Muf_0811082010_texture.glb',
  'Cinnamon Roll': 'Meshy_AI_Caramel_Pecan_Cinnamo_0811091237_texture.glb',
  'Cheese Sandwich': 'Meshy_AI_Avocado_toast_with_fr_0811081232_texture.glb',
  'Turkey Club': 'Meshy_AI_Stacked_Club_Sandwich_0811084753_texture.glb',
  'Caesar Salad': 'Meshy_AI_Grilled_Chicken_Caesa_0811085836_texture.glb',
  'Tiramisu': 'Meshy_AI_Sunlit_Tiramisu_Slice_0811100242_texture.glb',
  'Chocolate Lava Cake': 'Meshy_AI_Chocolate_Lava_Cake_w_0811093311_texture.glb',
  'Creme Brulee': 'Meshy_AI_Berry_Brûlée_Custar_0811092158_texture.glb',
  'Fresh Orange Juice': 'Meshy_AI_Citrus_Sunrise_0811144301_texture.glb',
  'Iced Lemonade': 'Meshy_AI_Citrus_Sparkle_0811143454_texture.glb'
};

const slugify = name => name.toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '');

// Normalizes a name for matching: strips accents (Crème -> Creme),
// lowercases, and collapses whitespace. This lets a menu item stored
// as "Crème Brûlée" in the database still match the "Creme Brulee"
// key below, instead of silently failing to find its model.
const normalizeKey = name => (name || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/\s+/g, ' ');

// Build a lookup from normalized name -> filename, once.
const NORMALIZED_MODEL_FILES = Object.fromEntries(
  Object.entries(MODEL_FILES).map(([name, file]) => [normalizeKey(name), file])
);

let renderer;
let scene;
let camera;
let stageEl;
let canvasEl;
let loaderEl;
let loaderTextEl;
let progressBarEl;
let backdropEl;

let dishGroup;
let keyLight;
let fillLight;
let rimLight;

let currentName = null;
let currentModel = null;

let rafId = null;

let isDragging = false;
let previousPointer = {
  x: 0,
  y: 0
};

let targetRotY = 0.35;
let rotY = 0.35;

let targetRotX = -0.12;
let rotX = -0.12;

let targetDistance = 3.8;
let distance = 3.8;

let autoRotate = true;
let paused = false;
let resumeTimer = null;


// ============================================================
// CREATE THREE.JS SCENE
// ============================================================

function ensureScene() {

  if (renderer) return;

  stageEl = document.getElementById('dish3d-stage');
  loaderEl = document.getElementById('dish3d-loader');
  loaderTextEl = document.getElementById('dish3d-loader-text');
  progressBarEl = document.getElementById('dish3d-progress-bar');
  backdropEl = document.getElementById('dish3d-stage-backdrop');

  if (!stageEl) return;

  canvasEl = document.createElement('canvas');
  canvasEl.id = 'dish3d-canvas';

  stageEl.appendChild(canvasEl);


  // Renderer
  renderer = new THREE.WebGLRenderer({
    canvas: canvasEl,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, 2)
  );

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  renderer.outputColorSpace = THREE.SRGBColorSpace;

  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  renderer.toneMappingExposure = 1.08;


  // Scene
  scene = new THREE.Scene();


  // Camera
  camera = new THREE.PerspectiveCamera(
    30,
    1,
    0.1,
    50
  );

  camera.position.set(
    0,
    0.9,
    distance
  );


  // ==========================================================
  // WARM CAFÉ LIGHTING
  // ==========================================================

  scene.add(
    new THREE.HemisphereLight(
      0xfff4df,
      0x17120e,
      1.35
    )
  );


  // Main light
  keyLight = new THREE.DirectionalLight(
    0xffe1ad,
    2.4
  );

  keyLight.position.set(
    4,
    6,
    5
  );

  keyLight.castShadow = true;

  keyLight.shadow.mapSize.set(
    1024,
    1024
  );

  scene.add(keyLight);


  // Fill light
  fillLight = new THREE.DirectionalLight(
    0xd6e4ff,
    0.75
  );

  fillLight.position.set(
    -4,
    3,
    2
  );

  scene.add(fillLight);


  // Rim light
  rimLight = new THREE.DirectionalLight(
    0xffb75e,
    1.0
  );

  rimLight.position.set(
    0,
    4,
    -5
  );

  scene.add(rimLight);


  // Group containing current dish
  dishGroup = new THREE.Group();

  scene.add(dishGroup);


  resize();

  window.addEventListener(
    'resize',
    resize
  );

  attachInteraction();

  animate();
}


// ============================================================
// RESIZE
// ============================================================

function resize() {

  if (
    !renderer ||
    !stageEl ||
    !camera
  ) {
    return;
  }

  const width = Math.max(
    1,
    stageEl.clientWidth
  );

  const height = Math.max(
    1,
    stageEl.clientHeight
  );


  renderer.setSize(
    width,
    height,
    false
  );


  camera.aspect =
    width / height;

  camera.updateProjectionMatrix();
}


// ============================================================
// NORMALIZE GLB MODEL
// ============================================================

function normalizeModel(root) {

  const box =
    new THREE.Box3()
      .setFromObject(root);


  const size =
    new THREE.Vector3();

  const center =
    new THREE.Vector3();


  box.getSize(size);

  box.getCenter(center);


  const maxDim =
    Math.max(
      size.x,
      size.y,
      size.z
    ) || 1;


  const targetSize = 2.25;

  const scale =
    targetSize / maxDim;


  const wrapper =
    new THREE.Group();


  // Center model
  root.position.sub(center);


  // Scale model
  root.scale.setScalar(scale);


  wrapper.add(root);


  // Put model close to floor
  const normalizedHeight =
    size.y * scale;


  wrapper.position.y =
    normalizedHeight * 0.5 - 0.22;


  // Shadows + material adjustments
  wrapper.traverse(object => {

    if (!object.isMesh) {
      return;
    }


    object.castShadow = true;

    object.receiveShadow = true;


    const materials =
      Array.isArray(object.material)
        ? object.material
        : [object.material];


    materials.forEach(material => {

      if (!material) {
        return;
      }


      if ('envMapIntensity' in material) {
        material.envMapIntensity = 1.2;
      }


      if (
        'roughness' in material &&
        material.roughness > 0.95
      ) {
        material.roughness = 0.85;
      }

    });

  });


  return wrapper;
}


// ============================================================
// LOAD REAL GLB
// ============================================================

function loadGLB(item, onProgress) {

  const key = item.name;

  const cached =
    modelCache.get(key);


  // Use cached model — instant, no network needed
  if (cached) {

    onProgress?.(1);

    return Promise.resolve(
      normalizeModel(
        cached.clone(true)
      )
    );

  }


  const filename =
    MODEL_FILES[item.name] ||
    NORMALIZED_MODEL_FILES[normalizeKey(item.name)] ||
    `dishes/${slugify(item.name)}.glb`;


  const urls = [

    `${MODELS_BASE}${filename}`,

    `${MODELS_BASE}dishes/${filename}`

  ];


  return new Promise(
    (resolve, reject) => {

      const tryLoad =
        index => {

          if (index >= urls.length) {

            reject(
              new Error(
                `3D model not found for "${item.name}"`
              )
            );

            return;
          }


          gltfLoader.load(

            urls[index],

            gltf => {

              modelCache.set(
                key,
                gltf.scene
              );


              onProgress?.(1);


              resolve(
                normalizeModel(
                  gltf.scene.clone(true)
                )
              );

            },

            progressEvent => {

              // progressEvent.total is only known if the server sends
              // a Content-Length header; fall back gracefully if not.
              if (progressEvent.lengthComputable && progressEvent.total > 0) {

                onProgress?.(
                  progressEvent.loaded / progressEvent.total
                );

              }

            },

            () => {

              tryLoad(
                index + 1
              );

            }

          );

        };


      tryLoad(0);

    }
  );
}


// ============================================================
// LOADER
// ============================================================

function showLoader(
  message = 'Loading 3D model…'
) {

  if (!loaderEl) {
    return;
  }

  if (loaderTextEl) {
    loaderTextEl.textContent = message;
  } else {
    loaderEl.textContent = message;
  }

  if (progressBarEl) {
    progressBarEl.style.width = '0%';
  }

  loaderEl.classList.remove(
    'hide'
  );
}


// Updates the progress bar + percentage text as the GLB downloads.
// `fraction` is 0..1. If the server doesn't send a Content-Length
// header we can't know the real percentage, so we just keep the
// label generic instead of showing a misleading number.
function updateLoaderProgress(itemName, fraction) {

  if (progressBarEl) {
    progressBarEl.style.width = `${Math.round(Math.min(1, fraction) * 100)}%`;
  }

  if (loaderTextEl) {
    const pct = Math.round(Math.min(1, fraction) * 100);
    loaderTextEl.textContent = fraction > 0
      ? `Loading ${itemName}… ${pct}%`
      : `Loading ${itemName}…`;
  }
}


function hideLoader() {

  loaderEl?.classList.add(
    'hide'
  );

  backdropEl?.classList.remove(
    'show'
  );

}


// ============================================================
// REMOVE OLD MODEL
// ============================================================

function clearCurrentModel() {

  if (
    !dishGroup ||
    !currentModel
  ) {
    return;
  }


  dishGroup.remove(
    currentModel
  );


  disposeObject(
    currentModel
  );


  currentModel = null;
}


// ============================================================
// DISPOSE THREE.JS OBJECTS
// ============================================================

function disposeObject(object) {

  object.traverse(child => {

    if (!child.isMesh) {
      return;
    }


    child.geometry?.dispose();


    const materials =
      Array.isArray(child.material)
        ? child.material
        : [child.material];


    materials.forEach(
      material => {

        material?.map?.dispose?.();

        material?.normalMap?.dispose?.();

        material?.roughnessMap?.dispose?.();

        material?.metalnessMap?.dispose?.();

        material?.aoMap?.dispose?.();

        material?.emissiveMap?.dispose?.();

        material?.dispose?.();

      }
    );

  });

}


// ============================================================
// MODEL ENTRANCE ANIMATION
// ============================================================

function animateIn(model) {

  const start =
    performance.now();

  const duration = 500;


  model.scale.setScalar(
    0.02
  );


  model.rotation.y =
    -0.7;


  const tick = () => {

    const t =
      Math.min(
        1,
        (performance.now() - start) /
        duration
      );


    const eased =
      1 -
      Math.pow(
        1 - t,
        3
      );


    model.scale.setScalar(
      eased
    );


    model.rotation.y =
      -0.7 +
      eased * 0.7;


    if (t < 1) {

      requestAnimationFrame(
        tick
      );

    }

  };


  requestAnimationFrame(
    tick
  );
}


// ============================================================
// OPEN 3D MODEL
// ============================================================

async function open(item) {

  ensureScene();


  if (
    !renderer ||
    !item
  ) {
    return;
  }


  paused = false;

  autoRotate = true;


  clearTimeout(
    resumeTimer
  );


  targetRotY =
    rotY =
    0.35;


  targetRotX =
    rotX =
    -0.12;


  targetDistance =
    distance =
    3.8;


  // Same model already open
  if (
    currentName === item.name &&
    currentModel
  ) {

    resize();

    return;

  }


  currentName =
    item.name;


  showLoader(
    `Loading ${item.name}…`
  );


  clearCurrentModel();


  try {

    const model =
      await loadGLB(
        item,
        fraction => updateLoaderProgress(item.name, fraction)
      );


    // User clicked another item
    if (
      currentName !== item.name
    ) {

      disposeObject(
        model
      );

      return;

    }


    currentModel =
      model;


    dishGroup.add(
      model
    );


    animateIn(
      model
    );


    hideLoader();


  } catch (error) {

    console.error(
      error
    );


    showLoader(
      '3D model unavailable'
    );


    setTimeout(
      () => hideLoader(),
      1600
    );

  }


  resize();
}


// ============================================================
// CLOSE
// ============================================================

function close() {

  paused = true;

  autoRotate = false;


  clearTimeout(
    resumeTimer
  );

}


// ============================================================
// MOUSE / TOUCH / ZOOM CONTROLS
// ============================================================

function attachInteraction() {

  // Start dragging
  canvasEl.addEventListener(
    'pointerdown',
    event => {

      isDragging = true;


      previousPointer.x =
        event.clientX;


      previousPointer.y =
        event.clientY;


      canvasEl.setPointerCapture?.(
        event.pointerId
      );


      clearTimeout(
        resumeTimer
      );

    }
  );


  // Rotate model
  canvasEl.addEventListener(
    'pointermove',
    event => {

      if (!isDragging) {
        return;
      }


      const dx =
        event.clientX -
        previousPointer.x;


      const dy =
        event.clientY -
        previousPointer.y;


      previousPointer.x =
        event.clientX;


      previousPointer.y =
        event.clientY;


      targetRotY +=
        dx * 0.012;


      targetRotX =
        Math.max(
          -0.65,
          Math.min(
            0.55,
            targetRotX +
            dy * 0.008
          )
        );

    }
  );


  // Stop dragging
  const release = () => {

    if (!isDragging) {
      return;
    }


    isDragging = false;

    autoRotate = true;

  };


  canvasEl.addEventListener(
    'pointerup',
    release
  );


  canvasEl.addEventListener(
    'pointercancel',
    release
  );


  canvasEl.addEventListener(
    'pointerleave',
    release
  );


  // Zoom
  canvasEl.addEventListener(
    'wheel',
    event => {

      event.preventDefault();


      targetDistance =
        Math.max(
          2.3,
          Math.min(
            6.5,
            targetDistance +
            event.deltaY * 0.0025
          )
        );


      autoRotate = false;


      clearTimeout(
        resumeTimer
      );


      resumeTimer =
        setTimeout(
          () => {
            autoRotate = true;
          },
          900
        );

    },
    {
      passive: false
    }
  );

}


// ============================================================
// ANIMATION LOOP
// ============================================================

function animate() {

  rafId =
    requestAnimationFrame(
      animate
    );


  if (
    paused ||
    !renderer
  ) {
    return;
  }


  const now =
    performance.now();


  const dt =
    Math.min(
      0.05,
      (
        now -
        (animate.last || now)
      ) / 1000
    );


  animate.last =
    now;


  // Automatic rotation
  if (
    autoRotate &&
    !isDragging
  ) {

    targetRotY +=
      dt * 0.28;

  }


  // Smooth rotation
  rotY +=
    (targetRotY - rotY) *
    0.09;


  rotX +=
    (targetRotX - rotX) *
    0.09;


  // Smooth zoom
  distance +=
    (targetDistance - distance) *
    0.1;


  if (dishGroup) {

    dishGroup.rotation.y =
      rotY;


    dishGroup.rotation.x =
      rotX * 0.22;


    // Very subtle floating effect
    dishGroup.position.y =
      Math.sin(
        now * 0.001
      ) * 0.018;

  }


  camera.position.set(
    0,
    0.82 - rotX * 0.65,
    distance
  );


  camera.lookAt(
    0,
    0.12,
    0
  );


  renderer.render(
    scene,
    camera
  );

}


// ============================================================
// PUBLIC API
// ============================================================

window.Dish3DEngine = {
  open,
  close
};
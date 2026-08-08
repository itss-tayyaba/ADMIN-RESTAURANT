import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    constructor() { this.onloadend = null; this.onerror = null; this.result = null; }
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((result) => {
        this.result = result;
        if (typeof this.onloadend === 'function') {
          this.onloadend();
        }
      }).catch((err) => {
        if (typeof this.onerror === 'function') this.onerror(err);
      });
    }
  };
}

const outputDir = path.join(process.cwd(), 'ember-and-brew', 'public', 'models');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

function writeGLB(name, group) {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(group, (result) => {
      const outPath = path.join(outputDir, `${name}.glb`);
      if (result instanceof ArrayBuffer) {
        fs.writeFileSync(outPath, Buffer.from(result));
      } else {
        fs.writeFileSync(outPath, JSON.stringify(result));
      }
      console.log('Created', outPath);
      resolve(outPath);
    }, (error) => reject(error), { binary: true, trs: false, onlyVisible: true, truncateDrawRange: true });
  });
}

function createBurger() {
  const group = new THREE.Group();
  const topBun = new THREE.Mesh(
    new THREE.SphereGeometry(1.25, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xdba76a, roughness: 0.58, metalness: 0.06 })
  );
  topBun.scale.set(1, 0.72, 1);
  topBun.position.y = 0.86;

  const bottomBun = new THREE.Mesh(
    new THREE.CylinderGeometry(1.3, 1.25, 0.42, 64),
    new THREE.MeshStandardMaterial({ color: 0xd3a568, roughness: 0.7 })
  );
  bottomBun.position.y = 0.2;

  const patty = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 1.05, 0.34, 64),
    new THREE.MeshStandardMaterial({ color: 0x613c24, roughness: 0.82 })
  );
  patty.position.y = 0.52;

  const cheese = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 0.08, 1.12),
    new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.45 })
  );
  cheese.position.set(0, 0.7, 0);
  cheese.rotation.x = 0.04;

  const lettuce = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.12, 16, 100),
    new THREE.MeshStandardMaterial({ color: 0x7abf68, roughness: 0.75 })
  );
  lettuce.position.y = 0.62;
  lettuce.rotation.x = Math.PI / 2;

  const tomatoMat = new THREE.MeshStandardMaterial({ color: 0xd94b3c, roughness: 0.72 });
  const tomatoPositions = [
    { x: 0.08, z: 0.42 },
    { x: -0.38, z: 0.18 },
    { x: 0.35, z: -0.2 }
  ];
  tomatoPositions.forEach(pos => {
    const slice = new THREE.Mesh(
      new THREE.CylinderGeometry(1.02, 1.02, 0.05, 32),
      tomatoMat
    );
    slice.position.set(pos.x, 0.66, pos.z);
    slice.rotation.x = Math.PI / 2;
    group.add(slice);
  });

  const seedMat = new THREE.MeshStandardMaterial({ color: 0xf5e7b4, roughness: 0.6 });
  const seedPositions = [
    [0.3, 1.15, 0.2], [0.1, 1.15, -0.35], [-0.25, 1.15, 0.15], [0.05, 1.15, 0.35], [-0.4, 1.15, -0.2]
  ];
  seedPositions.forEach(([x, y, z]) => {
    const seed = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), seedMat);
    seed.position.set(x, y, z);
    seed.rotation.x = Math.random() * Math.PI;
    seed.rotation.y = Math.random() * Math.PI;
    group.add(seed);
  });

  group.add(bottomBun, patty, cheese, lettuce, topBun);
  group.position.y = -0.4;
  group.scale.setScalar(0.82);
  return group;
}

function createPizza() {
  const group = new THREE.Group();
  const crust = new THREE.Mesh(
    new THREE.CylinderGeometry(1.35, 1.35, 0.32, 64),
    new THREE.MeshStandardMaterial({ color: 0xd1a170, roughness: 0.82 })
  );
  crust.position.y = 0.15;

  const sauce = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 0.07, 64),
    new THREE.MeshStandardMaterial({ color: 0xc33e2a, roughness: 0.72 })
  );
  sauce.position.y = 0.3;

  const cheese = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 1.05, 0.12, 64),
    new THREE.MeshStandardMaterial({ color: 0xf3d27a, roughness: 0.68 })
  );
  cheese.position.y = 0.38;

  group.add(crust, sauce, cheese);

  const pepperoniMat = new THREE.MeshStandardMaterial({ color: 0x8b2c24, roughness: 0.8 });
  const basilMat = new THREE.MeshStandardMaterial({ color: 0x4f8a2f, roughness: 0.77 });
  const oliveMat = new THREE.MeshStandardMaterial({ color: 0x2f3620, roughness: 0.78 });

  const pepperonis = [
    { x: 0.36, z: 0.22 }, { x: -0.4, z: 0.12 }, { x: 0.12, z: -0.4 },
    { x: -0.18, z: -0.48 }, { x: 0.5, z: -0.1 }, { x: -0.55, z: 0.33 }
  ];
  pepperonis.forEach(pos => {
    const slice = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 24), pepperoniMat);
    slice.position.set(pos.x, 0.48, pos.z);
    slice.rotation.x = Math.PI / 2;
    group.add(slice);
  });

  const basilLeaves = [
    { x: 0.05, z: 0.55 }, { x: -0.5, z: -0.1 }, { x: 0.25, z: -0.42 }
  ];
  basilLeaves.forEach(pos => {
    const leaf = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 32, Math.PI * 1.2), basilMat);
    leaf.position.set(pos.x, 0.51, pos.z);
    leaf.rotation.x = Math.PI / 2;
    leaf.rotation.z = Math.random() * 0.4 - 0.2;
    group.add(leaf);
  });

  const olives = [
    { x: 0.18, z: 0.08 }, { x: -0.15, z: 0.35 }, { x: 0.32, z: -0.3 }
  ];
  olives.forEach(pos => {
    const olive = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.035, 8, 24), oliveMat);
    olive.position.set(pos.x, 0.52, pos.z);
    olive.rotation.x = Math.PI / 2;
    group.add(olive);
  });

  group.position.y = -0.35;
  group.scale.setScalar(0.92);
  return group;
}

function createFries() {
  const group = new THREE.Group();
  const wrapper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.05, 1.55, 32, 1, false),
    new THREE.MeshStandardMaterial({ color: 0xd63b27, roughness: 0.72 })
  );
  wrapper.position.y = 0.72;
  wrapper.rotation.x = Math.PI * 0.01;

  const wrapperStripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.05, 0.2, 32, 1, false),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 })
  );
  wrapperStripe.position.y = 0.85;
  wrapper.add(wrapperStripe);

  const friesMat = new THREE.MeshStandardMaterial({ color: 0xfbc86a, roughness: 0.68 });
  const fryPositions = [
    [0.18, 1.25, -0.15, 1.45], [-0.2, 1.18, 0.12, 1.55], [0.4, 1.3, 0.35, 1.35],
    [-0.32, 1.22, -0.3, 1.4], [0.05, 1.36, 0.18, 1.6], [-0.12, 1.4, 0.45, 1.3],
    [0.28, 1.18, -0.4, 1.5]
  ];
  fryPositions.forEach(([x, y, z, h]) => {
    const fry = new THREE.Mesh(new THREE.BoxGeometry(0.14, h, 0.14), friesMat);
    fry.position.set(x, y + h * 0.45 - 0.4, z);
    fry.rotation.x = Math.random() * 0.05 - 0.025;
    fry.rotation.z = Math.random() * 0.2 - 0.1;
    group.add(fry);
  });

  group.add(wrapper);
  group.position.y = -0.15;
  group.scale.setScalar(0.85);
  return group;
}

function createCoffee() {
  const group = new THREE.Group();
  const cupBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.78, 0.76, 1.14, 40),
    new THREE.MeshStandardMaterial({ color: 0xf8f4ea, roughness: 0.55 })
  );
  cupBody.position.y = 0.62;

  const cupInner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 0.05, 40),
    new THREE.MeshStandardMaterial({ color: 0x3f2715, roughness: 0.4 })
  );
  cupInner.position.y = 1.16;

  const saucer = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.25, 0.12, 64),
    new THREE.MeshStandardMaterial({ color: 0xf1e8de, roughness: 0.8 })
  );
  saucer.position.y = 0.06;

  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.095, 18, 80, Math.PI * 1.25),
    new THREE.MeshStandardMaterial({ color: 0xf8f4ea, roughness: 0.55 })
  );
  handle.position.set(0.86, 0.78, 0);
  handle.rotation.z = Math.PI / 2;

  const foam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.66, 0.66, 0.05, 40),
    new THREE.MeshStandardMaterial({ color: 0xf7f2e8, roughness: 0.72 })
  );
  foam.position.y = 1.18;

  const latteArt = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.03, 16, 36, Math.PI * 1.6),
    new THREE.MeshStandardMaterial({ color: 0xf8f0de, roughness: 0.75 })
  );
  latteArt.position.y = 1.22;
  latteArt.rotation.x = Math.PI / 2;
  latteArt.rotation.z = 0.45;

  const steamMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 });
  const steam1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.5, 12), steamMat);
  steam1.position.set(-0.16, 1.82, 0);
  const steam2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.42, 12), steamMat);
  steam2.position.set(0.08, 2.02, -0.06);

  group.add(cupBody, saucer, cupInner, foam, latteArt, handle, steam1, steam2);
  group.position.y = -0.18;
  return group;
}

function prepareScene(group) {
  const scene = new THREE.Scene();
  scene.add(group);
  const directional = new THREE.DirectionalLight(0xffffff, 1.8);
  directional.position.set(5, 8, 7);
  directional.target.position.set(0, 0, 0);
  scene.add(directional);
  scene.add(directional.target);

  const point = new THREE.PointLight(0xfff3e2, 0.55, 12, 2);
  point.position.set(-4, 4, 3);
  scene.add(point);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(2.8, 64),
    new THREE.MeshStandardMaterial({ color: 0x2b2621, roughness: 0.78 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.45;
  scene.add(ground);
  return scene;
}

(async () => {
  try {
    await Promise.all([
      writeGLB('burger', prepareScene(createBurger())),
      writeGLB('pizza', prepareScene(createPizza())),
      writeGLB('fries', prepareScene(createFries())),
      writeGLB('coffee', prepareScene(createCoffee()))
    ]);
    console.log('All models generated.');
  } catch (err) {
    console.error('Failed to generate models:', err);
    process.exit(1);
  }
})();

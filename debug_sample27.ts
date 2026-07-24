import { initCoinPhysics, createCoinPhysicsSimulation } from './src/physics/coinPhysics.ts';
import { createPointerPhysicalTossInput } from './src/physics/physicalTossInput.ts';
import * as THREE from 'three';

await initCoinPhysics();

const index = 27;
const drift = index % 12;
const curve = index % 5;
const simulation = createCoinPhysicsSimulation(
  createPointerPhysicalTossInput({
    currentThrow: (index % 6) + 1,
    sceneWidth: 720,
    sceneHeight: 480,
    perturbationSeed: 0x2400beef + index * 0x45d9f3b,
    samples: [
      { x: 185 + drift * 18, y: 305 - curve * 13, timestamp: 0 },
      { x: 265 + drift * 14, y: 242 - (index % 7) * 9, timestamp: 78 + curve * 3 },
      { x: 355 + drift * 10, y: 178 + (index % 4) * 12, timestamp: 166 + curve * 6 },
      { x: 430 + drift * 6, y: 144 + (index % 6) * 9, timestamp: 224 + curve * 5 }
    ]
  })
);
let snapshot = simulation.snapshot();
for (let step = 0; step < 900 && !snapshot.settled; step++) {
  snapshot = simulation.step(1/60);
}
console.log(`Settled: ${snapshot.settled} elapsed: ${snapshot.elapsed.toFixed(2)}`);
snapshot.coins.forEach((c, i) => {
  const normalY = Math.abs(new THREE.Vector3(0,1,0).applyQuaternion(c.physicsRotation).y);
  console.log(`  coin${i}: y=${c.position.y.toFixed(3)} normalY=${normalY.toFixed(3)}`);
});
simulation.dispose();

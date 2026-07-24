
import { initCoinPhysics, createCoinPhysicsSimulation } from './src/physics/coinPhysics.ts';
import { createPointerPhysicalTossInput } from './src/physics/physicalTossInput.ts';
import * as THREE from 'three';

await initCoinPhysics();

const simulation = createCoinPhysicsSimulation(
  createPointerPhysicalTossInput({
    currentThrow: 1,
    sceneWidth: 720,
    sceneHeight: 480,
    perturbationSeed: 0x2400beef + 2 * 0x45d9f3b,
    samples: [
      { x: 185 + 2 * 18, y: 305 - 2 * 13, timestamp: 0 },
      { x: 265 + 2 * 14, y: 242 - (2 % 7) * 9, timestamp: 78 + 2 * 3 },
      { x: 355 + 2 * 10, y: 178 + (2 % 4) * 12, timestamp: 166 + 2 * 6 },
      { x: 430 + 2 * 6, y: 144 + (2 % 6) * 9, timestamp: 224 + 2 * 5 }
    ]
  })
);

let snapshot = simulation.snapshot();
for (let step = 0; step < 900 && !snapshot.settled; step++) {
  snapshot = simulation.step(1/60);
}

console.log('Settled:', snapshot.settled);
console.log('Elapsed:', snapshot.elapsed);
console.log('Reason:', snapshot.settledReason);
if (!snapshot.settled) {
  snapshot.coins.forEach((c, i) => {
    const pos = c.position;
    const rot = c.physicsRotation;
    const normalY = Math.abs(new THREE.Vector3(0,1,0).applyQuaternion(rot).y);
    console.log(`Coin ${i}: pos=${pos.x.toFixed(3)},${pos.y.toFixed(3)},${pos.z.toFixed(3)} normalY=${normalY.toFixed(3)}`);
  });
}
simulation.dispose();

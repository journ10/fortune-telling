import { initCoinPhysics, createCoinPhysicsSimulation } from './src/physics/coinPhysics.ts';
import { createPointerPhysicalTossInput } from './src/physics/physicalTossInput.ts';
import * as THREE from 'three';

await initCoinPhysics();

let failCount = 0;
for (let index = 0; index < 24; index++) {
  const simulation = createCoinPhysicsSimulation(
    createPointerPhysicalTossInput({
      currentThrow: (index % 6) + 1,
      sceneWidth: 720,
      sceneHeight: 480,
      perturbationSeed: 0x1000 + index * 0x12345,
      samples: [
        { x: 210 + index * 3, y: 260, timestamp: 0 },
        { x: 285 + index * 2, y: 220 - (index % 5) * 6, timestamp: 95 },
        { x: 360 + index, y: 170 + (index % 4) * 5, timestamp: 185 }
      ]
    })
  );
  let snapshot = simulation.snapshot();
  for (let step = 0; step < 900 && !snapshot.settled; step++) {
    snapshot = simulation.step(1/60);
  }
  if (!snapshot.settled) {
    failCount++;
    console.log(`FAIL sample ${index} elapsed=${snapshot.elapsed.toFixed(2)}`);
    snapshot.coins.forEach((c, i) => {
      const normalY = Math.abs(new THREE.Vector3(0,1,0).applyQuaternion(c.physicsRotation).y);
      console.log(`  coin${i}: y=${c.position.y.toFixed(3)} normalY=${normalY.toFixed(3)}`);
    });
  }
  simulation.dispose();
}
console.log(`Total failures: ${failCount}/24`);

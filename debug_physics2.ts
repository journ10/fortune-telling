import { initCoinPhysics, createCoinPhysicsSimulation } from './src/physics/coinPhysics.ts';
import { createPointerPhysicalTossInput } from './src/physics/physicalTossInput.ts';
import * as THREE from 'three';

await initCoinPhysics();

function testScenario(currentThrow: number, requestId: number) {
  const xOffset = ((requestId % 5) - 2) * 18;
  const yOffset = ((currentThrow % 3) - 1) * 14;
  const simulation = createCoinPhysicsSimulation(
    createPointerPhysicalTossInput({
      currentThrow,
      sceneWidth: 720,
      sceneHeight: 480,
      perturbationSeed: 0x5eed1234 ^ ((requestId + 17) * 0x9e3779b1),
      samples: [
        { x: 210 + xOffset, y: 290 + yOffset, timestamp: 0 },
        { x: 282 + xOffset, y: 232 + yOffset, timestamp: 90 },
        { x: 386 + xOffset, y: 164 + yOffset, timestamp: 180 }
      ]
    })
  );
  let snapshot = simulation.snapshot();
  for (let step = 0; step < 1500 && !snapshot.settled; step++) {
    snapshot = simulation.step(1/60);
  }
  console.log(`throw=${currentThrow} req=${requestId} settled=${snapshot.settled} elapsed=${snapshot.elapsed.toFixed(2)} reason=${snapshot.settledReason}`);
  if (!snapshot.settled) {
    snapshot.coins.forEach((c, i) => {
      const normalY = Math.abs(new THREE.Vector3(0,1,0).applyQuaternion(c.physicsRotation).y);
      const lin = simulation['snapshot'] ? null : null; // can't access private
      console.log(`  coin${i}: y=${c.position.y.toFixed(3)} normalY=${normalY.toFixed(3)}`);
    });
  }
  simulation.dispose();
  return snapshot.settled;
}

// Test the failing case
for (let r = 1; r <= 8; r++) {
  testScenario(1, r);
}

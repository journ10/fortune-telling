import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export interface PostProcessingSetup {
  composer: EffectComposer;
  ssao: SSAOPass;
  bloom: UnrealBloomPass;
  dispose: () => void;
}

/**
 * 为 tabletop 场景配置后处理管线：
 * SSAO（环境光遮蔽） + Bloom（铜光微泛光） + OutputPass（色调映射/色彩空间）。
 */
export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera
): PostProcessingSetup {
  const composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const ssao = new SSAOPass(
    scene,
    camera,
    window.innerWidth,
    window.innerHeight
  );
  ssao.kernelRadius = 0.2;
  ssao.minDistance = 0.01;
  ssao.maxDistance = 0.5;
  ssao.output = SSAOPass.OUTPUT.Default;
  composer.addPass(ssao);

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.15,
    0.4,
    1.0
  );
  composer.addPass(bloom);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  const handleResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    composer.setSize(w, h);
    ssao.setSize(w, h);
    bloom.setSize(w, h);
  };

  window.addEventListener('resize', handleResize);

  return {
    composer,
    ssao,
    bloom,
    dispose: () => {
      window.removeEventListener('resize', handleResize);
      composer.dispose();
    }
  };
}

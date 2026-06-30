import {
  FilesetResolver,
  GestureRecognizer,
  type GestureRecognizerResult
} from '@mediapipe/tasks-vision';

export type RecognizedGesture =
  | 'None'
  | 'Closed_Fist'
  | 'Open_Palm'
  | 'Pointing_Up'
  | 'Thumb_Down'
  | 'Thumb_Up'
  | 'Victory'
  | 'ILoveYou';

export interface GestureGate {
  update: (gesture: RecognizedGesture, timestamp: number) => boolean;
}

const RECOGNIZED_GESTURES: ReadonlySet<string> = new Set<RecognizedGesture>([
  'None',
  'Closed_Fist',
  'Open_Palm',
  'Pointing_Up',
  'Thumb_Down',
  'Thumb_Up',
  'Victory',
  'ILoveYou'
]);

export function createGestureGate(cooldownMs: number): GestureGate {
  let previousGesture: RecognizedGesture = 'None';
  let lastTriggerAt = Number.NEGATIVE_INFINITY;

  return {
    update(gesture, timestamp) {
      const shouldTrigger =
        previousGesture === 'Closed_Fist' &&
        gesture === 'Open_Palm' &&
        timestamp - lastTriggerAt >= cooldownMs;

      previousGesture = gesture;

      if (!shouldTrigger) {
        return false;
      }

      lastTriggerAt = timestamp;
      return true;
    }
  };
}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('当前浏览器不支持摄像头 API，请使用手动掷钱');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: 'user',
      width: { ideal: 960 },
      height: { ideal: 540 }
    }
  });

  try {
    video.srcObject = stream;
    await video.play();
    return stream;
  } catch (error) {
    stopCamera(stream);
    throw error;
  }
}

export function stopCamera(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

export async function createMediaPipeRecognizer(): Promise<GestureRecognizer> {
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
  );

  return GestureRecognizer.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'
    },
    runningMode: 'VIDEO',
    numHands: 1
  });
}

export function getTopGesture(result: GestureRecognizerResult): RecognizedGesture {
  const categoryName = result.gestures[0]?.[0]?.categoryName;

  if (categoryName && RECOGNIZED_GESTURES.has(categoryName)) {
    return categoryName as RecognizedGesture;
  }

  return 'None';
}

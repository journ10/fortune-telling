// Motion toss panel: bottom-sheet entry for device shake casting.
// Every state keeps a usable path — denial or missing sensors fall back
// to the touch chamber with a clear explanation, never a blocker.

import type { MotionPermissionState } from '../input/deviceShake';

interface MotionTossPanelProps {
  permission: MotionPermissionState;
  listening: boolean;
  charging: boolean;
  readyToRelease: boolean;
  chargeEnergy: number;
  onRequestPermission: () => void;
}

export default function MotionTossPanel({
  permission,
  listening,
  charging,
  readyToRelease,
  chargeEnergy,
  onRequestPermission
}: MotionTossPanelProps) {
  if (permission === 'unsupported') {
    return null;
  }

  let content: React.ReactNode;

  if (permission === 'denied') {
    content = (
      <p className="motionStatus" role="status">
        摇晃传感器权限未开启，可直接按住桌面拖动抛出。
      </p>
    );
  } else if (permission === 'requesting') {
    content = (
      <p className="motionStatus" role="status">
        等待传感器授权…
      </p>
    );
  } else if (listening) {
    content = (
      <div className="motionActive">
        <p className="motionStatus" role="status">
          {charging
            ? readyToRelease
              ? '能量已蓄满，静止手机以掷出'
              : '摇晃手机蓄势中…'
            : '摇晃手机开始，或按住桌面拖动'}
        </p>
        {charging ? (
          <div
            className="energyMeter"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={Math.round(chargeEnergy * 100) / 100}
            aria-label="摇晃能量"
          >
            <span style={{ width: `${Math.round(Math.min(1, chargeEnergy) * 100)}%` }} />
          </div>
        ) : null}
      </div>
    );
  } else {
    content = (
      <button type="button" className="ghostButton motionEnable" onClick={onRequestPermission}>
        开启摇晃投掷
      </button>
    );
  }

  return (
    <div className="motionPanel" data-testid="motion-panel">
      {content}
    </div>
  );
}

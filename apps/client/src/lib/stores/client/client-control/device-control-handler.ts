/**
 * Purpose: Execute device-level client control actions such as flashlight, screen, vibration, and sensors.
 */
import type {
  FlashlightPayload,
  ModulateSoundPayload,
  ScreenColorPayload,
  VibratePayload,
} from '@shugu/protocol';
import type { ClientControlDeps } from './types';
import { asRecord } from './types';

export function executeDeviceControl(deps: ClientControlDeps, action: string, payload: unknown, delaySeconds: number): boolean {
  switch (action) {
    case 'flashlight':
      deps.getFlashlightController()?.setMode(payload as FlashlightPayload);
      return true;
    case 'screenColor':
      deps.getScreenController()?.setColor(payload as ScreenColorPayload);
      return true;
    case 'screenBrightness': {
      const brightness = (payload as { brightness: number }).brightness;
      deps.getScreenController()?.setBrightness(brightness);
      return true;
    }
    case 'vibrate':
      deps.getVibrationController()?.vibrate(payload as VibratePayload);
      return true;
    case 'modulateSound':
      deps.getToneModulatedSoundPlayer()?.play(payload as ModulateSoundPayload, delaySeconds);
      return true;
    case 'modulateSoundUpdate': {
      const modPayload = payload as ModulateSoundPayload;
      const payloadRecord = asRecord(payload);
      const durationMs =
        typeof payloadRecord?.durationMs === 'number' ? payloadRecord.durationMs : modPayload.duration;
      deps.getToneModulatedSoundPlayer()?.update({
        frequency: modPayload.frequency,
        volume: modPayload.volume,
        waveform: modPayload.waveform,
        modFrequency: modPayload.modFrequency,
        modDepth: modPayload.modDepth,
        durationMs,
      });
      return true;
    }
    case 'setDataReportingRate': {
      const ratePayload = payload as { sensorHz?: number };
      if (deps.getSensorManager() && ratePayload.sensorHz) {
        deps.getSensorManager()?.setThrottleMs(1000 / ratePayload.sensorHz);
      }
      return true;
    }
    case 'setSensorState': {
      const sensorStatePayload = payload as { active: boolean };
      if (deps.getSensorManager()) {
        if (sensorStatePayload.active) deps.getSensorManager()?.start();
        else deps.getSensorManager()?.stop();
      }
      return true;
    }
    default:
      return false;
  }
}

// Purpose: Shared Rete socket instances for the manager node canvas.
import { ClassicPreset } from 'rete';

export const createReteSockets = () =>
  ({
    number: new ClassicPreset.Socket('number'),
    boolean: new ClassicPreset.Socket('boolean'),
    pulse: new ClassicPreset.Socket('pulse'),
    string: new ClassicPreset.Socket('string'),
    asset: new ClassicPreset.Socket('asset'),
    color: new ClassicPreset.Socket('color'),
    audio: new ClassicPreset.Socket('audio'),
    image: new ClassicPreset.Socket('image'),
    video: new ClassicPreset.Socket('video'),
    scene: new ClassicPreset.Socket('scene'),
    effect: new ClassicPreset.Socket('effect'),
    print: new ClassicPreset.Socket('print'),
    client: new ClassicPreset.Socket('client'),
    command: new ClassicPreset.Socket('command'),
    fuzzy: new ClassicPreset.Socket('fuzzy'),
    array: new ClassicPreset.Socket('array'),
    any: new ClassicPreset.Socket('any'),
  }) as const;

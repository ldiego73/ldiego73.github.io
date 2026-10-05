import * as audio from "../../audio";

type Factory = (opts?: { compact?: boolean }) => HTMLElement;

/**
 * Mounts the engine's mute/volume control (createAudioControl) into host.
 * Namespace access keeps the build working until the engine exports it; then this is a plain call.
 * Any failure leaves the slot empty: the cabinet never depends on audio.
 */
export function mountAudioControl(host: HTMLElement): void {
  try {
    const make = (audio as unknown as { createAudioControl?: Factory }).createAudioControl;
    if (make) host.appendChild(make({ compact: true }));
    else host.hidden = true;
  } catch {
    host.hidden = true;
  }
}

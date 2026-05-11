/**
 * Один Web Audio `AudioContext` на вкладку для всех экземпляров Phaser.Game.
 * В конфиге `audio: { context }` Phaser при destroy делает suspend, а не close —
 * иначе при SPA/HMR/пересоздании игры остаются таймеры blur/visible и падают
 * «Cannot suspend/resume a closed AudioContext».
 */
let shared: AudioContext | undefined;

export function getSharedPhaserAudioContext(): AudioContext {
  if (typeof window === "undefined") {
    throw new Error("getSharedPhaserAudioContext: window is undefined");
  }
  if (shared && shared.state !== "closed") {
    return shared;
  }
  const Ctor =
    window.AudioContext ??
    (
      window as unknown as {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  if (!Ctor) {
    throw new Error("Web Audio API is not available");
  }
  shared = new Ctor();
  return shared;
}

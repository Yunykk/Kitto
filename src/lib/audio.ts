import * as desktop from "./audio-desktop";
import { androidRequest, isAndroidAudio } from "./android-bridge";
import { createAndroidAudio } from "./android-audio";
import type { EqualizerSettings } from "./equalizer";
import type { TuningTarget } from "./tuning";

export type { AudioProgress, AudioPlaybackSnapshot } from "./audio-desktop";
export const nativeAudio = isAndroidAudio() ? createAndroidAudio(androidRequest) : null;
const engine = nativeAudio ?? desktop;

export const configureEqualizer = (settings: EqualizerSettings) => engine.configureEqualizer(settings);
export const configureTuning = (target: TuningTarget) => engine.configureTuning(target);
export const loadAudio = (path: string, position = 0) => engine.loadAudio(path, position);
export const unloadAudio = () => engine.unloadAudio();
export const playAudio = () => engine.playAudio();
export const pauseAudio = () => engine.pauseAudio();
export const setVolume = (volume: number) => engine.setVolume(volume);
export const seekTo = (position: number) => engine.seekTo(position);
export const getAudioProgress = () => engine.getAudioProgress();
export const getAudioPlayback = () => engine.getAudioPlayback();
export const onAudioProgress = (callback: Parameters<typeof desktop.onAudioProgress>[0]) => engine.onAudioProgress(callback);
export const onAudioPlayback = (callback: Parameters<typeof desktop.onAudioPlayback>[0]) => engine.onAudioPlayback(callback);
export const onAudioEnded = (callback: () => void) => engine.onAudioEnded(callback);
export const onAudioError = (callback: () => void) => engine.onAudioError(callback);

if (import.meta.hot) import.meta.hot.dispose(() => nativeAudio?.dispose());

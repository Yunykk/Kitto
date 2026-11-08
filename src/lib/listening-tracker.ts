import type { ListeningCredit, ListeningTrack } from "./listening-types";

export type ListeningSample = {
  loadId: number;
  position: number;
  duration: number;
  active: boolean;
  seeking: boolean;
  ended: boolean;
  playbackRate: number;
  track: ListeningTrack | null;
};

export function createListeningTracker(
  onCredit: (credit: ListeningCredit) => void,
  clock: { monotonic: () => number; wall: () => number; id: () => string } = {
    monotonic: () => performance.now(), wall: () => Date.now(), id: () => crypto.randomUUID(),
  },
) {
  let previous: (ListeningSample & { time: number }) | null = null;
  let session: {
    id: string; loadId: number; track: ListeningTrack; startedAt: number;
    seconds: number; mediaSeconds: number; pending: number; qualified: boolean; reportedPlay: boolean; ended: boolean;
  } | null = null;

  function publish() {
    if (!session || (session.pending <= 0 && (!session.qualified || session.reportedPlay))) return;
    onCredit({
      sessionId: session.id, track: { ...session.track }, startedAt: session.startedAt,
      at: clock.wall(), seconds: session.pending, qualified: session.qualified,
    });
    session.pending = 0;
    session.reportedPlay ||= session.qualified;
  }

  function sample(value: ListeningSample) {
    const time = clock.monotonic();
    const sameLoad = previous?.loadId === value.loadId;
    const replay = sameLoad && session?.ended && value.active && !value.ended && !value.seeking;
    if (session && (session.loadId !== value.loadId || replay)) {
      publish();
      session = null;
    }
    if (!session && value.active && value.track && !value.seeking) {
      session = {
        id: clock.id(), loadId: value.loadId, track: { ...value.track },
        startedAt: clock.wall(), seconds: 0, mediaSeconds: 0, pending: 0, qualified: false, reportedPlay: false, ended: false,
      };
    }
    if (session && sameLoad) {
      if (value.ended) session.ended = true;
      if (value.track?.id === session.track.id) session.track = { ...value.track };
      if (previous?.active && !previous.seeking && !value.seeking && !replay) {
        const elapsed = Math.max(0, (time - previous.time) / 1000);
        const advanced = (value.position - previous.position) / Math.max(0.01, previous.playbackRate);
        // A seek jump is not listening time.
        if (Number.isFinite(advanced) && advanced > 0 && advanced <= elapsed + 0.75) {
          const seconds = Math.min(advanced, elapsed);
          session.seconds += seconds;
          session.mediaSeconds += seconds * previous.playbackRate;
          session.pending += seconds;
        }
      }
      const halfTrack = Number.isFinite(value.duration) && value.duration > 0 &&
        session.mediaSeconds + 1e-6 >= value.duration / 2;
      if (session.seconds + 1e-6 >= 30 || halfTrack) session.qualified = true;
      if (session.pending >= 1 || !value.active || (session.qualified && !session.reportedPlay)) publish();
    }
    previous = { ...value, time };
  }

  function reset() {
    session = null;
    previous = null;
  }

  return { sample, flush: publish, reset };
}

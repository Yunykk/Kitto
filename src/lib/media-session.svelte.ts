import { onMount } from "svelte";
import { getAudioProgress, onAudioProgress } from "./audio";

type SessionState = {
  readonly hasTrack: boolean;
  readonly title: string;
  readonly artist: string | null;
  readonly album: string | null;
  readonly coverUrl: string | null;
  readonly isPlaying: boolean;
  readonly canPrevious: boolean;
  readonly canNext: boolean;
};

type SessionActions = {
  togglePlayback: () => void;
  previousTrack: () => void;
  nextTrack: () => void;
  seekBy: (seconds: number) => void;
};

function setHandler(
  session: MediaSession,
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null,
) {
  try {
    session.setActionHandler(action, handler);
  } catch (cause) {
    console.debug(`Media action unavailable: ${action}`, cause);
  }
}

export function createMediaSession(
  state: SessionState,
  actions: SessionActions,
) {
  const session =
    typeof navigator !== "undefined" && "mediaSession" in navigator
      ? navigator.mediaSession
      : null;

  $effect(() => {
    if (!session || typeof MediaMetadata === "undefined") return;

    session.metadata = state.hasTrack
      ? new MediaMetadata({
          title: state.title,
          artist: state.artist ?? "",
          album: state.album ?? "",
          artwork: state.coverUrl ? [{ src: state.coverUrl }] : [],
        })
      : null;
  });

  $effect(() => {
    if (!session) return;

    session.playbackState = !state.hasTrack
      ? "none"
      : state.isPlaying
        ? "playing"
        : "paused";
  });

  $effect(() => {
    if (!session) return;

    setHandler(
      session,
      "previoustrack",
      state.canPrevious ? actions.previousTrack : null,
    );
    setHandler(
      session,
      "nexttrack",
      state.canNext ? actions.nextTrack : null,
    );
  });

  onMount(() => {
    if (!session) return;

    setHandler(session, "play", () => {
      if (state.hasTrack && !state.isPlaying) actions.togglePlayback();
    });
    setHandler(session, "pause", () => {
      if (state.isPlaying) actions.togglePlayback();
    });
    setHandler(session, "seekbackward", (details) => {
      actions.seekBy(-(details.seekOffset ?? 10));
    });
    setHandler(session, "seekforward", (details) => {
      actions.seekBy(details.seekOffset ?? 10);
    });
    setHandler(session, "seekto", (details) => {
      if (
        typeof details.seekTime !== "number" ||
        !Number.isFinite(details.seekTime)
      ) {
        return;
      }

      const { currentTime } = getAudioProgress();
      actions.seekBy(details.seekTime - currentTime);
    });

    const removeProgress = onAudioProgress(({ currentTime, duration }) => {
      if (typeof session.setPositionState !== "function") return;

      if (
        !state.hasTrack ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        !Number.isFinite(currentTime)
      ) {
        session.setPositionState();
        return;
      }

      session.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.max(0, Math.min(currentTime, duration)),
      });
    });

    return () => {
      removeProgress();

      const actions: MediaSessionAction[] = [
        "play", "pause", "previoustrack", "nexttrack",
        "seekbackward", "seekforward", "seekto",
      ];
      for (const action of actions) setHandler(session, action, null);

      session.metadata = null;
      session.playbackState = "none";
      if (typeof session.setPositionState === "function") {
        session.setPositionState();
      }
    };
  });
}

export type ListeningTrack = {
  id: string;
  title: string;
  artist: string | null;
  album: string | null;
};

export type ListeningTrackTotals = ListeningTrack & {
  seconds: number;
  plays: number;
  lastPlayedAt: number;
};

export type ListeningHistoryEntry = ListeningTrack & {
  sessionId: string;
  startedAt: number;
  lastPlayedAt: number;
  seconds: number;
  qualified: boolean;
};

export type ListeningDay = {
  date: string;
  seconds: number;
  plays: number;
};

export type ListeningData = {
  version: 1;
  seconds: number;
  plays: number;
  tracks: ListeningTrackTotals[];
  days: ListeningDay[];
  history: ListeningHistoryEntry[];
};

export type ListeningCredit = {
  sessionId: string;
  track: ListeningTrack;
  startedAt: number;
  at: number;
  seconds: number;
  qualified: boolean;
};

export type ListeningSummary = {
  totals: { seconds: number; plays: number; tracks: number; artists: number };
  today: { seconds: number; plays: number };
  days: (ListeningDay & { label: string })[];
  topTracks: {
    trackId: string;
    title: string;
    artist: string | null;
    seconds: number;
    plays: number;
    lastPlayedAt: number;
    available: boolean;
  }[];
  topArtists: { name: string; seconds: number; plays: number }[];
  recent: {
    sessionId: string;
    trackId: string;
    title: string;
    artist: string | null;
    seconds: number;
    playedAt: number;
    qualified: boolean;
    available: boolean;
  }[];
};

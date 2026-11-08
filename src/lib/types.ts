export type Track = {
  id: string;
  title: string;
};

export type QueueTrack = Track & {
  path: string;
  addedAt?: number;
  lastPlayedAt?: number;
};

export type TrackTags = {
  title: string | null;
  artist: string | null;
  album: string | null;
  albumArtist?: string | null;
  trackNumber?: number | null;
  discNumber?: number | null;
};

export type CoverStatus = "loading" | "ready" | "missing" | "error";

export type DisplayTrack = QueueTrack & {
  fileName: string;
  artist: string | null;
  album: string | null;
  albumArtist?: string | null;
  trackNumber?: number | null;
  discNumber?: number | null;
};

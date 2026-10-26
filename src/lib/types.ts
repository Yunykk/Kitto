export type Track = {
  id: string;
  title: string;
};

export type QueueTrack = Track & {
  path: string;
};

export type TrackTags = {
  title: string | null;
  artist: string | null;
  album: string | null;
};

export type DisplayTrack = QueueTrack & {
  fileName: string;
  artist: string | null;
  album: string | null;
};

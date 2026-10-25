export type Track = {
  id: string;
  title: string;
};

export type QueueTrack = Track & {
  path: string;
};
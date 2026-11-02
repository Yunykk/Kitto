export type CollectionView = "compact" | "list" | "grid" | "covers";
export type CollectionSort = "recent" | "added" | "title" | "artist" | "album" | "order";
export type CollectionScope = "music" | "playlists";
export type CollectionSettings = { view: CollectionView; sort: CollectionSort };
export type CollectionItem = {
  id: string;
  title: string;
  subtitle: string;
  paths: string[];
  artist?: string | null;
  album?: string | null;
  addedAt?: number;
  lastPlayedAt?: number;
};

export const views: { id: CollectionView; name: string; path: string }[] = [
  { id: "compact", name: "Compact", path: "M4 6h16M4 12h16M4 18h16" },
  { id: "list", name: "List", path: "M4 5h3v3H4zM11 6h9M4 11h3v3H4zM11 12h9M4 17h3v3H4zM11 18h9" },
  { id: "grid", name: "Grid", path: "M3 3h4v4H3zM10 3h4v4h-4zM17 3h4v4h-4zM3 10h4v4H3zM10 10h4v4h-4zM17 10h4v4h-4zM3 17h4v4H3zM10 17h4v4h-4zM17 17h4v4h-4z" },
  { id: "covers", name: "Covers", path: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" },
];
export const sortNames: Record<CollectionSort, string> = {
  recent: "Recently played", added: "Recently added", title: "Title",
  artist: "Artist", album: "Album", order: "Playlist order",
};

export function parseCollectionSettings(value: unknown, scope: CollectionScope): CollectionSettings {
  const fallback: CollectionSettings = { view: "list", sort: "added" };
  if (typeof value !== "object" || value === null) return fallback;
  const view = "view" in value && views.some((item) => item.id === value.view)
    ? value.view as CollectionView : fallback.view;
  const allowed = scope === "music"
    ? ["recent", "added", "title", "artist", "album"] : ["recent", "added", "title"];
  const sort = "sort" in value && typeof value.sort === "string" && allowed.includes(value.sort)
    ? value.sort as CollectionSort : fallback.sort;
  return { view, sort };
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
export function filterAndSort(items: CollectionItem[], query: string, sort: CollectionSort): CollectionItem[] {
  const term = query.trim().toLocaleLowerCase();
  const indexed = items.map((item, index) => ({ item, index })).filter(({ item }) =>
    [item.title, item.subtitle, item.artist, item.album].filter(Boolean)
      .join(" ").toLocaleLowerCase().includes(term),
  );
  if (sort === "order") return indexed.map(({ item }) => item);
  indexed.sort((a, b) => {
    let result = 0;
    if (sort === "recent") result = (b.item.lastPlayedAt ?? 0) - (a.item.lastPlayedAt ?? 0);
    if (sort === "added") result = (b.item.addedAt ?? b.index) - (a.item.addedAt ?? a.index);
    if (sort === "title") result = collator.compare(a.item.title, b.item.title);
    if (sort === "artist") result = collator.compare(a.item.artist ?? "", b.item.artist ?? "");
    if (sort === "album") result = collator.compare(a.item.album ?? "", b.item.album ?? "");
    return result || (sort === "added" || sort === "recent" ? b.index - a.index : a.index - b.index);
  });
  return indexed.map(({ item }) => item);
}

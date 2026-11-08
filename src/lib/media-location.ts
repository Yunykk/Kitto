export function isContentUri(path: string): boolean {
  return /^content:\/\//i.test(path);
}

export function requirePlayablePaths(paths: readonly string[]) {
  if (paths.some(isContentUri)) {
    throw new Error("Android documents must be imported through the Android app. No files were added.");
  }
}

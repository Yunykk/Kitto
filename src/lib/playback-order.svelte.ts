export function createPlaybackOrder(getTrackIds: () => string[]) {
  let currentId = $state<string | null>(null);
  let shuffle = $state(false);
  let history = $state<string[]>([]);
  let cursor = $state(-1);
  let played = $state<string[]>([]);

  function select(id: string, restartCycle = false) {
    if (!getTrackIds().includes(id)) return;

    if (restartCycle) {
      played = [id];
      history = history.slice(0, cursor + 1);
    }

    if (id === currentId) return;

    currentId = id;

    if (shuffle) {
      history = [...history.slice(0, cursor + 1), id];
      cursor = history.length - 1;

      if (!played.includes(id)) {
        played = [...played, id];
      }
    } else {
      history = [id];
      cursor = 0;
      played = [id];
    }
  }

  function setShuffle(enabled: boolean) {
    shuffle = enabled;
    history = currentId ? [currentId] : [];
    cursor = history.length - 1;
    played = currentId ? [currentId] : [];
  }

  function clear() {
    currentId = null;
    history = [];
    cursor = -1;
    played = [];
  }

  function finishCycle(repeatAll: boolean) {
    if (!shuffle || repeatAll) return;

    const ids = getTrackIds();
    const hasForwardHistory = history
      .slice(cursor + 1)
      .some((id) => ids.includes(id));

    if (
      ids.length > 0 &&
      !hasForwardHistory &&
      ids.every((id) => played.includes(id))
    ) {
      setShuffle(false);
    }
  }

  function next(repeatAll: boolean): string | null {
    const ids = getTrackIds();

    if (ids.length === 0) return null;

    if (!shuffle) {
      const index = ids.indexOf(currentId ?? "");
      const target = ids[index + 1] ?? (repeatAll ? ids[0] : null);

      if (!target) return null;

      select(target);
      return target;
    }

    for (let index = cursor + 1; index < history.length; index += 1) {
      const id = history[index];

      if (ids.includes(id)) {
        cursor = index;
        currentId = id;
        finishCycle(repeatAll);
        return id;
      }
    }

    let choices = ids.filter(
      (id) => id !== currentId && !played.includes(id),
    );

    if (choices.length === 0) {
      if (!repeatAll) {
        setShuffle(false);
        return next(false);
      }

      played = currentId ? [currentId] : [];
      choices = ids.filter((id) => id !== currentId);

      if (choices.length === 0) {
        return currentId;
      }
    }

    const target = choices[Math.floor(Math.random() * choices.length)];

    select(target);
    finishCycle(repeatAll);
    return target;
  }

  function previous(repeatAll: boolean): string | null {
    const ids = getTrackIds();

    if (!shuffle) {
      const index = ids.indexOf(currentId ?? "");
      const target =
        ids[index - 1] ??
        (repeatAll ? ids[ids.length - 1] : null);

      if (!target) return null;

      select(target);
      return target;
    }

    for (let index = cursor - 1; index >= 0; index -= 1) {
      const id = history[index];

      if (ids.includes(id)) {
        cursor = index;
        currentId = id;
        return id;
      }
    }

    return null;
  }

  function canNext(repeatAll: boolean) {
    const ids = getTrackIds();

    if (ids.length === 0) return false;
    if (repeatAll) return true;

    if (!shuffle) {
      return ids.indexOf(currentId ?? "") < ids.length - 1;
    }

    return (
      history.slice(cursor + 1).some((id) => ids.includes(id)) ||
      ids.some((id) => id !== currentId && !played.includes(id)) ||
      ids.indexOf(currentId ?? "") < ids.length - 1
    );
  }

  function canPrevious(repeatAll: boolean) {
    const ids = getTrackIds();

    if (!shuffle) {
      return (
        ids.indexOf(currentId ?? "") > 0 ||
        (repeatAll && ids.length > 0)
      );
    }

    return history.slice(0, cursor).some((id) => ids.includes(id));
  }

  return {
    get currentId() { return currentId; },
    get shuffle() { return shuffle; },
    select,
    setShuffle,
    clear,
    finishCycle,
    next,
    previous,
    canNext,
    canPrevious,
  };
}

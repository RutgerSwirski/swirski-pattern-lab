export type HistoryState<T> = {
  past: T[];
  present: T;
  future: T[];
};

type HistoryOptions<T> = {
  maxHistorySteps: number;
  transactionStart?: T | null;
};

export function applyHistoryUpdate<T>(
  history: HistoryState<T>,
  nextPresent: T,
  options: HistoryOptions<T>,
) {
  if (Object.is(nextPresent, history.present)) {
    return history;
  }

  if (options.transactionStart) {
    return {
      ...history,
      present: nextPresent,
    };
  }

  return {
    past: [...history.past, history.present].slice(-options.maxHistorySteps),
    present: nextPresent,
    future: [],
  };
}

export function commitHistoryTransaction<T>(
  history: HistoryState<T>,
  transactionStart: T | null,
  didChange: boolean,
  maxHistorySteps: number,
) {
  if (!transactionStart || !didChange || Object.is(transactionStart, history.present)) {
    return history;
  }

  return {
    past: [...history.past, transactionStart].slice(-maxHistorySteps),
    present: history.present,
    future: [],
  };
}

export function undoHistory<T>(history: HistoryState<T>) {
  const previousPresent = history.past[history.past.length - 1];

  if (!previousPresent) {
    return history;
  }

  return {
    past: history.past.slice(0, -1),
    present: previousPresent,
    future: [history.present, ...history.future],
  };
}

export function redoHistory<T>(history: HistoryState<T>) {
  const nextPresent = history.future[0];

  if (!nextPresent) {
    return history;
  }

  return {
    past: [...history.past, history.present],
    present: nextPresent,
    future: history.future.slice(1),
  };
}

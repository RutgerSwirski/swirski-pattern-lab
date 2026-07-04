import { describe, expect, it } from "vitest";

import {
  applyHistoryUpdate,
  commitHistoryTransaction,
  redoHistory,
  undoHistory,
  type HistoryState,
} from "./history";

describe("history", () => {
  it("stores one undo snapshot for a committed drag transaction", () => {
    let history: HistoryState<string> = {
      past: [],
      present: "before drag",
      future: [],
    };
    const transactionStart = history.present;

    history = applyHistoryUpdate(history, "drag preview 1", {
      maxHistorySteps: 100,
      transactionStart,
    });
    history = applyHistoryUpdate(history, "drag preview 2", {
      maxHistorySteps: 100,
      transactionStart,
    });

    expect(history.past).toEqual([]);
    expect(history.present).toBe("drag preview 2");

    history = commitHistoryTransaction(history, transactionStart, true, 100);

    expect(history.past).toEqual(["before drag"]);
    expect(history.present).toBe("drag preview 2");

    history = undoHistory(history);

    expect(history.present).toBe("before drag");
    expect(history.future).toEqual(["drag preview 2"]);
  });

  it("does not add history for an unchanged transaction", () => {
    const history: HistoryState<string> = {
      past: [],
      present: "same",
      future: [],
    };

    expect(commitHistoryTransaction(history, history.present, false, 100)).toBe(
      history,
    );
  });

  it("clears redo history after a normal update", () => {
    const history = applyHistoryUpdate(
      {
        past: ["before"],
        present: "current",
        future: ["redo"],
      },
      "next",
      {
        maxHistorySteps: 100,
        transactionStart: null,
      },
    );

    expect(history.past).toEqual(["before", "current"]);
    expect(history.present).toBe("next");
    expect(history.future).toEqual([]);
  });

  it("redoes an undone state", () => {
    const undone = undoHistory({
      past: ["start"],
      present: "next",
      future: [],
    });

    expect(redoHistory(undone).present).toBe("next");
  });
});

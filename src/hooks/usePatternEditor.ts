import { useCallback, useEffect, useRef, useState } from "react";

import {
  applyHistoryUpdate,
  commitHistoryTransaction as commitHistoryTransactionState,
  redoHistory,
  undoHistory,
  type HistoryState,
} from "../lib/history";
import {
  clearBezierSegmentInPieces,
  deletePatternPointsInPieces,
  focusPatternPointsInPieces,
  insertPatternPointInPieces,
  translatePatternSegmentInPieces,
  updateCurveHandleInPieces,
  updatePatternPointInPieces,
  updatePieceMetadataInPieces,
  updatePiecePositionInPieces,
} from "../lib/patternOperations";
import { createSymmetricPiecePair } from "../lib/symmetry";
import type {
  PatternPiece,
  PatternPoint,
  PieceMetadata,
  PointPosition,
  Tool,
} from "../types";

type FocusedPoint = {
  pieceId: string;
  pointIds: string[];
};

type PieceHistory = HistoryState<PatternPiece[]>;

const MAX_HISTORY_STEPS = 100;

function createInitialPiece(): PatternPiece {
  return {
    id: "front-panel",
    name: "Front Panel",
    lengthMm: 0,
    cornerRadiusMm: 0,
    quantity: 1,
    notes: "",
    points: [
      { id: "top-left", x: -120, y: -160 },
      { id: "top-right", x: 120, y: -160 },
      { id: "bottom-right", x: 140, y: 180 },
      { id: "bottom-left", x: -140, y: 180 },
    ],
    x: 0,
    y: 0,
  };
}

export function usePatternEditor() {
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [pieceHistory, setPieceHistory] = useState<PieceHistory>({
    past: [],
    present: [createInitialPiece()],
    future: [],
  });
  const [draftPoints, setDraftPoints] = useState<PatternPoint[]>([]);
  const [draftCursor, setDraftCursor] = useState<PointPosition | null>(null);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [focusedPoint, setFocusedPoint] = useState<FocusedPoint | null>(null);
  const idSeed = useRef(crypto.randomUUID());
  const nextId = useRef(1);
  const historyTransactionStart = useRef<PatternPiece[] | null>(null);
  const historyTransactionChanged = useRef(false);
  const pieces = pieceHistory.present;
  const selectedPiece =
    pieces.find((piece) => piece.id === selectedPieceId) ?? null;
  const canUndo = pieceHistory.past.length > 0;
  const canRedo = pieceHistory.future.length > 0;

  const makeId = useCallback((prefix: string) => {
    const id = `${prefix}-${idSeed.current}-${nextId.current}`;
    nextId.current += 1;
    return id;
  }, []);

  const updatePieces = useCallback(
    (updater: (currentPieces: PatternPiece[]) => PatternPiece[]) => {
      const transactionStart = historyTransactionStart.current;

      setPieceHistory((currentHistory) => {
        const nextPieces = updater(currentHistory.present);

        if (transactionStart) {
          historyTransactionChanged.current =
            historyTransactionChanged.current ||
            nextPieces !== currentHistory.present;
        }

        return applyHistoryUpdate(currentHistory, nextPieces, {
          maxHistorySteps: MAX_HISTORY_STEPS,
          transactionStart,
        });
      });
    },
    [],
  );

  const beginHistoryTransaction = useCallback(() => {
    if (!historyTransactionStart.current) {
      historyTransactionStart.current = pieceHistory.present;
      historyTransactionChanged.current = false;
    }
  }, [pieceHistory.present]);

  const commitHistoryTransaction = useCallback(() => {
    const transactionStart = historyTransactionStart.current;
    const didChange = historyTransactionChanged.current;

    historyTransactionStart.current = null;
    historyTransactionChanged.current = false;

    setPieceHistory((currentHistory) => {
      return commitHistoryTransactionState(
        currentHistory,
        transactionStart,
        didChange,
        MAX_HISTORY_STEPS,
      );
    });
  }, []);

  const undo = useCallback(() => {
    historyTransactionStart.current = null;
    historyTransactionChanged.current = false;

    setPieceHistory((currentHistory) => {
      return undoHistory(currentHistory);
    });
    setFocusedPoint(null);
  }, []);

  const redo = useCallback(() => {
    historyTransactionStart.current = null;
    historyTransactionChanged.current = false;

    setPieceHistory((currentHistory) => {
      return redoHistory(currentHistory);
    });
    setFocusedPoint(null);
  }, []);

  function updatePatternPoint(
    pieceId: string,
    pointId: string,
    x: number,
    y: number,
  ) {
    updatePieces((currentPieces) =>
      updatePatternPointInPieces(currentPieces, pieceId, pointId, x, y),
    );
  }

  function translatePatternSegment(
    pieceId: string,
    startPointId: string,
    endPointId: string,
    deltaX: number,
    deltaY: number,
  ) {
    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    updatePieces((currentPieces) =>
      translatePatternSegmentInPieces(
        currentPieces,
        pieceId,
        startPointId,
        endPointId,
        deltaX,
        deltaY,
      ),
    );
  }

  function focusPatternPoints(pieceId: string, pointIds: string[]) {
    setSelectedPieceId(pieceId);
    setFocusedPoint({ pieceId, pointIds });

    updatePieces((currentPieces) =>
      focusPatternPointsInPieces(currentPieces, pieceId, pointIds),
    );
  }

  function focusPatternPoint(pieceId: string, pointId: string) {
    focusPatternPoints(pieceId, [pointId]);
  }

  function updateCurveHandle(
    pieceId: string,
    pointId: string,
    handle: "curveIn" | "curveOut",
    position: PointPosition,
  ) {
    updatePieces((currentPieces) =>
      updateCurveHandleInPieces(
        currentPieces,
        pieceId,
        pointId,
        handle,
        position,
      ),
    );
  }

  function clearBezierSegment(pieceId: string, startPointId: string) {
    updatePieces((currentPieces) =>
      clearBezierSegmentInPieces(currentPieces, pieceId, startPointId),
    );
  }

  function insertPatternPoint(
    pieceId: string,
    afterPointId: string,
    point: PointPosition,
    progress?: number,
  ) {
    const newPoint = {
      id: makeId("point"),
      ...point,
    };

    updatePieces((currentPieces) =>
      insertPatternPointInPieces(
        currentPieces,
        pieceId,
        afterPointId,
        newPoint,
        progress,
      ),
    );
  }

  const deletePatternPoints = useCallback((pieceId: string, pointIds: string[]) => {
    updatePieces((currentPieces) =>
      deletePatternPointsInPieces(currentPieces, pieceId, pointIds),
    );

    setFocusedPoint(null);
  }, [updatePieces]);

  function updatePiecePosition(pieceId: string, x: number, y: number) {
    updatePieces((currentPieces) =>
      updatePiecePositionInPieces(currentPieces, pieceId, x, y),
    );
  }

  function updatePieceMetadata(pieceId: string, metadata: PieceMetadata) {
    updatePieces((currentPieces) =>
      updatePieceMetadataInPieces(currentPieces, pieceId, metadata),
    );
  }

  function createSymmetricPiece() {
    if (!selectedPiece || selectedPiece.symmetry) {
      return;
    }

    const mirroredPieceId = makeId("piece");
    const { sourcePiece, mirroredPiece } = createSymmetricPiecePair(
      selectedPiece,
      mirroredPieceId,
    );

    updatePieces((currentPieces) => [
      ...currentPieces.map((piece) =>
        piece.id === selectedPiece.id ? sourcePiece : piece,
      ),
      mirroredPiece,
    ]);
  }

  function cancelDraftPiece() {
    setDraftPoints([]);
    setDraftCursor(null);
    setFocusedPoint(null);
    setActiveTool("select");
  }

  function selectPiece(pieceId: string) {
    setSelectedPieceId(pieceId);
    setFocusedPoint((currentFocusedPoint) =>
      currentFocusedPoint?.pieceId === pieceId ? currentFocusedPoint : null,
    );
  }

  function clearSelection() {
    setSelectedPieceId(null);
    setFocusedPoint(null);
  }

  const finishDraftPiece = useCallback(() => {
    if (draftPoints.length < 3) {
      return;
    }

    updatePieces((currentPieces) => [
      ...currentPieces,
      {
        id: makeId("piece"),
        name: `Pattern Piece ${currentPieces.length + 1}`,
        lengthMm: 0,
        cornerRadiusMm: 0,
        quantity: 1,
        notes: "",
        points: draftPoints,
        x: 0,
        y: 0,
      },
    ]);

    setDraftPoints([]);
    setDraftCursor(null);
    setFocusedPoint(null);
    setActiveTool("select");
  }, [draftPoints, makeId, updatePieces]);

  useEffect(() => {
    function handleDraftKeyboardShortcuts(event: KeyboardEvent) {
      if (activeTool !== "draw") {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        finishDraftPiece();
      }

      if (event.key === "Escape") {
        cancelDraftPiece();
      }
    }

    window.addEventListener("keydown", handleDraftKeyboardShortcuts);

    return () => {
      window.removeEventListener("keydown", handleDraftKeyboardShortcuts);
    };
  }, [activeTool, finishDraftPiece]);

  useEffect(() => {
    function handleSelectedPointKeyboardShortcuts(event: KeyboardEvent) {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement;

      if (isTyping || !focusedPoint) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();

        deletePatternPoints(focusedPoint.pieceId, focusedPoint.pointIds);
      }
    }

    window.addEventListener("keydown", handleSelectedPointKeyboardShortcuts);

    return () => {
      window.removeEventListener(
        "keydown",
        handleSelectedPointKeyboardShortcuts,
      );
    };
  }, [focusedPoint, deletePatternPoints]);

  useEffect(() => {
    function handleHistoryKeyboardShortcuts(event: KeyboardEvent) {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement;

      if (isTyping || !(event.metaKey || event.ctrlKey)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
        return;
      }

      if (key === "z") {
        event.preventDefault();
        undo();
        return;
      }

      if (key === "y") {
        event.preventDefault();
        redo();
      }
    }

    window.addEventListener("keydown", handleHistoryKeyboardShortcuts);

    return () => {
      window.removeEventListener("keydown", handleHistoryKeyboardShortcuts);
    };
  }, [redo, undo]);

  return {
    activeTool,
    beginHistoryTransaction,
    canRedo,
    canUndo,
    commitHistoryTransaction,
    draftCursor,
    draftPoints,
    focusedPoint,
    pieces,
    selectedPiece,
    selectedPieceId,
    cancelDraftPiece,
    clearBezierSegment,
    clearSelection,
    createSymmetricPiece,
    finishDraftPiece,
    focusPatternPoint,
    focusPatternPoints,
    insertPatternPoint,
    makeId,
    redo,
    selectPiece,
    setActiveTool,
    setDraftCursor,
    setDraftPoints,
    undo,
    translatePatternSegment,
    updateCurveHandle,
    updatePatternPoint,
    updatePieceMetadata,
    updatePiecePosition,
  };
}

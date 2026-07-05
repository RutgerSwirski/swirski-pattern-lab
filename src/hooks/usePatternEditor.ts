import { useCallback, useEffect, useRef, useState } from "react";

import {
  applyHistoryUpdate,
  commitHistoryTransaction as commitHistoryTransactionState,
  redoHistory,
  undoHistory,
  type HistoryState,
} from "../lib/history";
import {
  bendPatternSegmentInPieces,
  clearBezierSegmentInPieces,
  deletePatternPieceInPieces,
  deletePatternPointsInPieces,
  duplicatePatternPiece,
  focusPatternPointsInPieces,
  focusPatternSegmentInPieces,
  insertPatternPointInPieces,
  translatePatternSegmentInPieces,
  updateCurveHandleInPieces,
  updatePatternPointInPieces,
  updatePieceMetadataInPieces,
  updatePiecePositionInPieces,
} from "../lib/patternOperations";
import { createSymmetricPiecePair } from "../lib/symmetry";
import type {
  FocusedCurveHandle,
  PatternPiece,
  PatternPoint,
  PieceTool,
  PieceMetadata,
  PointPosition,
  Tool,
  PreviewTransform,
} from "../types";

type FocusedPoint = {
  canDeletePoints: boolean;
  curveHandles: FocusedCurveHandle[];
  pieceId: string;
  pointIds: string[];
};

type PieceHistory = HistoryState<PatternPiece[]>;

const MAX_HISTORY_STEPS = 100;
const PASTE_OFFSET_MM = 20;

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
  const [pieceTool, setPieceTool] = useState<PieceTool>("move");
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
  const copiedPiece = useRef<PatternPiece | null>(null);
  const pasteCount = useRef(0);
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

  function bendPatternSegment(
    pieceId: string,
    startPointId: string,
    endPointId: string,
    bendPoint: PointPosition,
  ) {
    updatePieces((currentPieces) =>
      bendPatternSegmentInPieces(
        currentPieces,
        pieceId,
        startPointId,
        endPointId,
        bendPoint,
      ),
    );
  }

  function focusPatternPoints(pieceId: string, pointIds: string[]) {
    setSelectedPieceId(pieceId);
    setFocusedPoint({
      canDeletePoints: true,
      curveHandles: pointIds.flatMap((pointId) => [
        { pointId, handle: "curveIn" },
        { pointId, handle: "curveOut" },
      ]),
      pieceId,
      pointIds,
    });

    updatePieces((currentPieces) =>
      focusPatternPointsInPieces(currentPieces, pieceId, pointIds),
    );
  }

  function focusPatternSegment(
    pieceId: string,
    startPointId: string,
    endPointId: string,
  ) {
    const pointIds = [startPointId, endPointId];

    setSelectedPieceId(pieceId);
    setFocusedPoint({
      canDeletePoints: false,
      curveHandles: [
        { pointId: startPointId, handle: "curveOut" },
        { pointId: endPointId, handle: "curveIn" },
      ],
      pieceId,
      pointIds,
    });

    updatePieces((currentPieces) =>
      focusPatternSegmentInPieces(
        currentPieces,
        pieceId,
        startPointId,
        endPointId,
      ),
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

  const deletePatternPoints = useCallback(
    (pieceId: string, pointIds: string[]) => {
      updatePieces((currentPieces) =>
        deletePatternPointsInPieces(currentPieces, pieceId, pointIds),
      );

      setFocusedPoint(null);
    },
    [updatePieces],
  );

  const deleteSelectedPiece = useCallback(() => {
    if (!selectedPieceId) {
      return;
    }

    updatePieces((currentPieces) =>
      deletePatternPieceInPieces(currentPieces, selectedPieceId),
    );
    setSelectedPieceId(null);
    setFocusedPoint(null);
    setPieceTool("move");
  }, [selectedPieceId, updatePieces]);

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

  const copySelectedPiece = useCallback(() => {
    if (!selectedPiece) {
      return;
    }

    copiedPiece.current = selectedPiece;
    pasteCount.current = 0;
  }, [selectedPiece]);

  const pasteCopiedPiece = useCallback(() => {
    if (!copiedPiece.current) {
      return;
    }

    pasteCount.current += 1;

    const pastedPiece = duplicatePatternPiece(
      copiedPiece.current,
      makeId("piece"),
      () => makeId("point"),
      {
        x: PASTE_OFFSET_MM * pasteCount.current,
        y: PASTE_OFFSET_MM * pasteCount.current,
      },
    );

    updatePieces((currentPieces) => [...currentPieces, pastedPiece]);
    setSelectedPieceId(pastedPiece.id);
    setFocusedPoint(null);
    setActiveTool("select");
    setPieceTool("move");
  }, [makeId, updatePieces]);

  function cancelDraftPiece() {
    setDraftPoints([]);
    setDraftCursor(null);
    setFocusedPoint(null);
    setActiveTool("select");
    setPieceTool("move");
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
    setPieceTool("move");
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
    setPieceTool("move");
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

      if (isTyping) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (focusedPoint?.canDeletePoints) {
          event.preventDefault();

          deletePatternPoints(focusedPoint.pieceId, focusedPoint.pointIds);
          return;
        }

        if (!focusedPoint && selectedPieceId) {
          event.preventDefault();

          deleteSelectedPiece();
        }
      }
    }

    window.addEventListener("keydown", handleSelectedPointKeyboardShortcuts);

    return () => {
      window.removeEventListener(
        "keydown",
        handleSelectedPointKeyboardShortcuts,
      );
    };
  }, [focusedPoint, selectedPieceId, deletePatternPoints, deleteSelectedPiece]);

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

  useEffect(() => {
    function handleClipboardKeyboardShortcuts(event: KeyboardEvent) {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement;

      if (isTyping || !(event.metaKey || event.ctrlKey)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "c" && selectedPiece) {
        event.preventDefault();
        copySelectedPiece();
        return;
      }

      if (key === "v" && copiedPiece.current) {
        event.preventDefault();
        pasteCopiedPiece();
      }
    }

    window.addEventListener("keydown", handleClipboardKeyboardShortcuts);

    return () => {
      window.removeEventListener("keydown", handleClipboardKeyboardShortcuts);
    };
  }, [copySelectedPiece, pasteCopiedPiece, selectedPiece]);

  const updatePiecePreviewTransform = useCallback(
    (pieceId: string, previewTransform: PreviewTransform) => {
      updatePieces((currentPieces) => {
        const currentPiece = currentPieces.find(
          (piece) => piece.id === pieceId,
        );

        if (!currentPiece) {
          return currentPieces;
        }

        const currentTransform = currentPiece.previewTransform;

        const hasNotChanged =
          currentTransform?.position[0] === previewTransform.position[0] &&
          currentTransform?.position[1] === previewTransform.position[1] &&
          currentTransform?.position[2] === previewTransform.position[2] &&
          currentTransform?.rotation[0] === previewTransform.rotation[0] &&
          currentTransform?.rotation[1] === previewTransform.rotation[1] &&
          currentTransform?.rotation[2] === previewTransform.rotation[2];

        if (hasNotChanged) {
          return currentPieces;
        }

        return currentPieces.map((piece) =>
          piece.id === pieceId
            ? {
                ...piece,
                previewTransform,
              }
            : piece,
        );
      });
    },
    [updatePieces],
  );

  return {
    activeTool,
    bendPatternSegment,
    beginHistoryTransaction,
    canRedo,
    canUndo,
    commitHistoryTransaction,
    draftCursor,
    draftPoints,
    focusedPoint,
    pieceTool,
    pieces,
    selectedPiece,
    selectedPieceId,
    cancelDraftPiece,
    clearBezierSegment,
    clearSelection,
    createSymmetricPiece,
    copySelectedPiece,
    deleteSelectedPiece,
    finishDraftPiece,
    focusPatternPoint,
    focusPatternPoints,
    focusPatternSegment,
    insertPatternPoint,
    makeId,
    pasteCopiedPiece,
    redo,
    selectPiece,
    setActiveTool,
    setDraftCursor,
    setDraftPoints,
    setPieceTool,
    undo,
    translatePatternSegment,
    updateCurveHandle,
    updatePatternPoint,
    updatePieceMetadata,
    updatePiecePosition,
    updatePiecePreviewTransform,
  };
}

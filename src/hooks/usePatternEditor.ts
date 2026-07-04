import { useCallback, useEffect, useRef, useState } from "react";

import { mirrorPointPosition } from "../lib/geometry";
import {
  applyHistoryUpdate,
  commitHistoryTransaction as commitHistoryTransactionState,
  redoHistory,
  undoHistory,
  type HistoryState,
} from "../lib/history";
import { clearBezierSegmentHandles } from "../lib/patternEditing";
import {
  createSymmetricPiecePair,
  getSymmetricLocalPosition,
  getSymmetricPatternPoint,
} from "../lib/symmetry";
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

type PiecePair = {
  editedPiece: PatternPiece;
  linkedPiece: PatternPiece | null;
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

function getPiecePair(
  pieces: PatternPiece[],
  pieceId: string,
): PiecePair | null {
  const editedPiece = pieces.find((piece) => piece.id === pieceId);

  if (!editedPiece) {
    return null;
  }

  return {
    editedPiece,
    linkedPiece: editedPiece.symmetry
      ? (pieces.find((piece) => piece.id === editedPiece.symmetry?.pairId) ??
        null)
      : null,
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
      setPieceHistory((currentHistory) => {
        const nextPieces = updater(currentHistory.present);

        if (historyTransactionStart.current) {
          historyTransactionChanged.current =
            historyTransactionChanged.current ||
            nextPieces !== currentHistory.present;
        }

        return applyHistoryUpdate(currentHistory, nextPieces, {
          maxHistorySteps: MAX_HISTORY_STEPS,
          transactionStart: historyTransactionStart.current,
        });
      });
    },
    [],
  );

  const beginHistoryTransaction = useCallback(() => {
    setPieceHistory((currentHistory) => {
      if (!historyTransactionStart.current) {
        historyTransactionStart.current = currentHistory.present;
        historyTransactionChanged.current = false;
      }

      return currentHistory;
    });
  }, []);

  const commitHistoryTransaction = useCallback(() => {
    setPieceHistory((currentHistory) => {
      const transactionStart = historyTransactionStart.current;
      const didChange = historyTransactionChanged.current;

      historyTransactionStart.current = null;
      historyTransactionChanged.current = false;

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
      currentPieces.map((piece) => {
        const pair = getPiecePair(currentPieces, pieceId);

        if (
          !pair ||
          (piece.id !== pieceId && piece.id !== pair.linkedPiece?.id)
        ) {
          return piece;
        }

        const sourcePoint = pair.editedPiece.points.find(
          (point) => point.id === pointId,
        );

        if (!sourcePoint) {
          return piece;
        }

        const deltaX = x - sourcePoint.x;
        const deltaY = y - sourcePoint.y;
        const updatedSourcePoint = {
          ...sourcePoint,
          x,
          y,
          curveIn: sourcePoint.curveIn
            ? {
                x: sourcePoint.curveIn.x + deltaX,
                y: sourcePoint.curveIn.y + deltaY,
              }
            : undefined,
          curveOut: sourcePoint.curveOut
            ? {
                x: sourcePoint.curveOut.x + deltaX,
                y: sourcePoint.curveOut.y + deltaY,
              }
            : undefined,
        };

        const updatedPoint =
          piece.id === pair.linkedPiece?.id && pair.linkedPiece
            ? getSymmetricPatternPoint(
                updatedSourcePoint,
                pair.editedPiece,
                pair.linkedPiece,
              )
            : updatedSourcePoint;

        return {
          ...piece,
          points: piece.points.map((point) =>
            point.id === pointId ? updatedPoint : point,
          ),
        };
      }),
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
      currentPieces.map((piece) => {
        const pair = getPiecePair(currentPieces, pieceId);

        if (
          !pair ||
          (piece.id !== pieceId && piece.id !== pair.linkedPiece?.id)
        ) {
          return piece;
        }

        const movedPointIds = new Set([startPointId, endPointId]);
        const updatedSourcePoints = pair.editedPiece.points.map((point) => {
          if (!movedPointIds.has(point.id)) {
            return point;
          }

          return {
            ...point,
            x: point.x + deltaX,
            y: point.y + deltaY,
            curveIn: point.curveIn
              ? {
                  x: point.curveIn.x + deltaX,
                  y: point.curveIn.y + deltaY,
                }
              : undefined,
            curveOut: point.curveOut
              ? {
                  x: point.curveOut.x + deltaX,
                  y: point.curveOut.y + deltaY,
                }
              : undefined,
          };
        });

        return {
          ...piece,
          points: piece.points.map((point) => {
            if (!movedPointIds.has(point.id)) {
              return point;
            }

            const updatedSourcePoint = updatedSourcePoints.find(
              (sourcePoint) => sourcePoint.id === point.id,
            );

            if (!updatedSourcePoint) {
              return point;
            }

            return piece.id === pair.linkedPiece?.id && pair.linkedPiece
              ? getSymmetricPatternPoint(
                  updatedSourcePoint,
                  {
                    ...pair.editedPiece,
                    points: updatedSourcePoints,
                  },
                  pair.linkedPiece,
                )
              : updatedSourcePoint;
          }),
        };
      }),
    );
  }

  function focusPatternPoints(pieceId: string, pointIds: string[]) {
    setSelectedPieceId(pieceId);
    setFocusedPoint({ pieceId, pointIds });

    updatePieces((currentPieces) =>
      currentPieces.map((piece) => {
        const pair = getPiecePair(currentPieces, pieceId);

        if (
          !pair ||
          (piece.id !== pieceId && piece.id !== pair.linkedPiece?.id)
        ) {
          return piece;
        }

        return {
          ...piece,
          points: piece.points.map((currentPoint) => {
            if (!pointIds.includes(currentPoint.id)) {
              return currentPoint;
            }

            const pointIndex = pair.editedPiece.points.findIndex(
              (point) => point.id === currentPoint.id,
            );

            if (pointIndex === -1) {
              return currentPoint;
            }

            const point = pair.editedPiece.points[pointIndex];

            if (point.curveIn && point.curveOut) {
              return currentPoint;
            }

            const previous =
              pair.editedPiece.points[
                (pointIndex - 1 + pair.editedPiece.points.length) %
                  pair.editedPiece.points.length
              ];
            const next =
              pair.editedPiece.points[
                (pointIndex + 1) % pair.editedPiece.points.length
              ];

            const updatedSourcePoint = {
              ...point,
              curveIn: point.curveIn ?? {
                x: point.x + (previous.x - point.x) / 3,
                y: point.y + (previous.y - point.y) / 3,
              },
              curveOut: point.curveOut ?? {
                x: point.x + (next.x - point.x) / 3,
                y: point.y + (next.y - point.y) / 3,
              },
            };

            return piece.id === pair.linkedPiece?.id && pair.linkedPiece
              ? getSymmetricPatternPoint(
                  updatedSourcePoint,
                  pair.editedPiece,
                  pair.linkedPiece,
                )
              : updatedSourcePoint;
          }),
        };
      }),
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
      currentPieces.map((piece) => {
        const pair = getPiecePair(currentPieces, pieceId);

        if (
          !pair ||
          (piece.id !== pieceId && piece.id !== pair.linkedPiece?.id)
        ) {
          return piece;
        }

        const linkedPosition =
          piece.id === pair.linkedPiece?.id && pair.linkedPiece
            ? getSymmetricLocalPosition(
                position,
                pair.editedPiece,
                pair.linkedPiece,
              )
            : position;

        return {
          ...piece,
          points: piece.points.map((point) =>
            point.id === pointId
              ? {
                  ...point,
                  [handle]: linkedPosition,
                }
              : point,
          ),
        };
      }),
    );
  }

  function clearBezierSegment(pieceId: string, startPointId: string) {
    updatePieces((currentPieces) =>
      currentPieces.map((piece) => {
        const pair = getPiecePair(currentPieces, pieceId);

        if (
          !pair ||
          (piece.id !== pieceId && piece.id !== pair.linkedPiece?.id)
        ) {
          return piece;
        }

        return {
          ...piece,
          points: clearBezierSegmentHandles(piece.points, startPointId),
        };
      }),
    );
  }

  function insertPatternPoint(
    pieceId: string,
    afterPointId: string,
    point: PointPosition,
  ) {
    const newPoint = {
      id: makeId("point"),
      ...point,
    };

    updatePieces((currentPieces) =>
      currentPieces.map((piece) => {
        const pair = getPiecePair(currentPieces, pieceId);

        if (
          !pair ||
          (piece.id !== pieceId && piece.id !== pair.linkedPiece?.id)
        ) {
          return piece;
        }

        const insertIndex = piece.points.findIndex(
          (currentPoint) => currentPoint.id === afterPointId,
        );

        if (insertIndex === -1) {
          return piece;
        }

        const pointToInsert =
          piece.id === pair.linkedPiece?.id && pair.linkedPiece
            ? {
                id: newPoint.id,
                ...getSymmetricLocalPosition(
                  newPoint,
                  pair.editedPiece,
                  pair.linkedPiece,
                ),
              }
            : newPoint;

        return {
          ...piece,
          points: [
            ...piece.points.slice(0, insertIndex + 1),
            pointToInsert,
            ...piece.points.slice(insertIndex + 1),
          ],
        };
      }),
    );
  }

  const deletePatternPoints = useCallback((pieceId: string, pointIds: string[]) => {
    const idsToDelete = new Set(pointIds);

    updatePieces((currentPieces) => {
      const pair = getPiecePair(currentPieces, pieceId);

      if (!pair) {
        return currentPieces;
      }

      if (pair.editedPiece.points.length - idsToDelete.size < 3) {
        return currentPieces;
      }

      return currentPieces.map((piece) => {
        const isEditedPiece = piece.id === pair.editedPiece.id;
        const isLinkedPiece = piece.id === pair.linkedPiece?.id;

        if (!isEditedPiece && !isLinkedPiece) {
          return piece;
        }

        return {
          ...piece,
          points: piece.points.filter((point) => !idsToDelete.has(point.id)),
        };
      });
    });

    setFocusedPoint(null);
  }, [updatePieces]);

  function updatePiecePosition(pieceId: string, x: number, y: number) {
    updatePieces((currentPieces) =>
      currentPieces.map((piece) => {
        const pair = getPiecePair(currentPieces, pieceId);

        if (
          !pair ||
          (piece.id !== pieceId && piece.id !== pair.linkedPiece?.id)
        ) {
          return piece;
        }

        if (piece.id === pieceId) {
          return {
            ...piece,
            x,
            y,
          };
        }

        if (!pair.linkedPiece || !pair.editedPiece.symmetry) {
          return piece;
        }

        const mirroredWorldPosition = mirrorPointPosition(
          { x, y },
          pair.editedPiece.symmetry.axisX,
        );

        return {
          ...piece,
          x: mirroredWorldPosition.x,
          y: mirroredWorldPosition.y,
        };
      }),
    );
  }

  function updatePieceMetadata(pieceId: string, metadata: PieceMetadata) {
    updatePieces((currentPieces) =>
      currentPieces.map((piece) => {
        const pair = getPiecePair(currentPieces, pieceId);

        return piece.id === pieceId || piece.id === pair?.linkedPiece?.id
          ? {
              ...piece,
              ...metadata,
            }
          : piece;
      }),
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

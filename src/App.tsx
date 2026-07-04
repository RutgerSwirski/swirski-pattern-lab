import { useCallback, useEffect, useRef, useState } from "react";

import { PatternCanvas } from "./components/PatternCanvas";
import { PieceInspector } from "./components/PieceInspector";
import { Toolbar } from "./components/Toolbar";
import { mirrorPointPosition } from "./lib/geometry";
import { clearBezierSegmentHandles } from "./lib/patternEditing";
import {
  createSymmetricPiecePair,
  getSymmetricLocalPosition,
  getSymmetricPatternPoint,
} from "./lib/symmetry";
import type {
  Camera,
  PatternPiece,
  PatternPoint,
  PieceMetadata,
  PointPosition,
  Tool,
  Viewport,
} from "./types";

type FocusedPoint = {
  pieceId: string;
  pointId: string;
};

type PiecePair = {
  editedPiece: PatternPiece;
  linkedPiece: PatternPiece | null;
};

type PieceHistory = {
  past: PatternPiece[][];
  present: PatternPiece[];
  future: PatternPiece[][];
};

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

function getPiecePair(pieces: PatternPiece[], pieceId: string): PiecePair | null {
  const editedPiece = pieces.find((piece) => piece.id === pieceId);

  if (!editedPiece) {
    return null;
  }

  return {
    editedPiece,
    linkedPiece: editedPiece.symmetry
      ? pieces.find((piece) => piece.id === editedPiece.symmetry?.pairId) ?? null
      : null,
  };
}

function App() {
  const [viewport, setViewport] = useState<Viewport>({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const [camera, setCamera] = useState<Camera>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    scale: 1,
  });

  const [isPanning, setIsPanning] = useState(false);
  const [lastPointerPosition, setLastPointerPosition] =
    useState<PointPosition | null>(null);
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
  const nextId = useRef(1);
  const pieces = pieceHistory.present;
  const canUndo = pieceHistory.past.length > 0;
  const canRedo = pieceHistory.future.length > 0;

  function makeId(prefix: string) {
    const id = `${prefix}-${nextId.current}`;
    nextId.current += 1;
    return id;
  }

  const updatePieces = useCallback((
    updater: (currentPieces: PatternPiece[]) => PatternPiece[],
  ) => {
    setPieceHistory((currentHistory) => {
      const nextPieces = updater(currentHistory.present);

      if (nextPieces === currentHistory.present) {
        return currentHistory;
      }

      return {
        past: [...currentHistory.past, currentHistory.present].slice(
          -MAX_HISTORY_STEPS,
        ),
        present: nextPieces,
        future: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    setPieceHistory((currentHistory) => {
      const previousPieces =
        currentHistory.past[currentHistory.past.length - 1];

      if (!previousPieces) {
        return currentHistory;
      }

      return {
        past: currentHistory.past.slice(0, -1),
        present: previousPieces,
        future: [currentHistory.present, ...currentHistory.future],
      };
    });
    setFocusedPoint(null);
  }, []);

  const redo = useCallback(() => {
    setPieceHistory((currentHistory) => {
      const nextPieces = currentHistory.future[0];

      if (!nextPieces) {
        return currentHistory;
      }

      return {
        past: [...currentHistory.past, currentHistory.present].slice(
          -MAX_HISTORY_STEPS,
        ),
        present: nextPieces,
        future: currentHistory.future.slice(1),
      };
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

        if (!pair || (piece.id !== pieceId && piece.id !== pair.linkedPiece?.id)) {
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

  function focusPatternPoint(pieceId: string, pointId: string) {
    setSelectedPieceId(pieceId);
    setFocusedPoint({ pieceId, pointId });

    updatePieces((currentPieces) =>
      currentPieces.map((piece) => {
        const pair = getPiecePair(currentPieces, pieceId);

        if (!pair || (piece.id !== pieceId && piece.id !== pair.linkedPiece?.id)) {
          return piece;
        }

        const pointIndex = pair.editedPiece.points.findIndex(
          (point) => point.id === pointId,
        );

        if (pointIndex === -1) {
          return piece;
        }

        const point = pair.editedPiece.points[pointIndex];

        if (point.curveIn && point.curveOut) {
          return piece;
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
          points: piece.points.map((currentPoint) =>
            currentPoint.id === pointId
              ? updatedPoint
              : currentPoint,
          ),
        };
      }),
    );
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

        if (!pair || (piece.id !== pieceId && piece.id !== pair.linkedPiece?.id)) {
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

        if (!pair || (piece.id !== pieceId && piece.id !== pair.linkedPiece?.id)) {
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

        if (!pair || (piece.id !== pieceId && piece.id !== pair.linkedPiece?.id)) {
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

  const deletePatternPoint = useCallback((pieceId: string, pointId: string) => {
    const piece = pieces.find((currentPiece) => currentPiece.id === pieceId);

    if (!piece || piece.points.length <= 3) {
      return;
    }

    updatePieces((currentPieces) =>
      currentPieces.map((currentPiece) =>
        currentPiece.id === pieceId ||
        currentPiece.id === piece.symmetry?.pairId
          ? {
              ...currentPiece,
              points: currentPiece.points.filter(
                (point) => point.id !== pointId,
              ),
            }
          : currentPiece,
      ),
    );

    setFocusedPoint((currentFocusedPoint) =>
      currentFocusedPoint?.pieceId === pieceId &&
      currentFocusedPoint.pointId === pointId
        ? null
        : currentFocusedPoint,
    );
  }, [pieces, updatePieces]);

  function updatePiecePosition(pieceId: string, x: number, y: number) {
    updatePieces((currentPieces) =>
      currentPieces.map((piece) => {
        const pair = getPiecePair(currentPieces, pieceId);

        if (!pair || (piece.id !== pieceId && piece.id !== pair.linkedPiece?.id)) {
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

        const editedWorldPosition = { x, y };
        const mirroredWorldPosition = mirrorPointPosition(
          editedWorldPosition,
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
  }, [draftPoints, updatePieces]);

  useEffect(() => {
    function handleResize() {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

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
        deletePatternPoint(focusedPoint.pieceId, focusedPoint.pointId);
      }
    }

    window.addEventListener("keydown", handleSelectedPointKeyboardShortcuts);

    return () => {
      window.removeEventListener("keydown", handleSelectedPointKeyboardShortcuts);
    };
  }, [deletePatternPoint, focusedPoint]);

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

  const selectedPiece =
    pieces.find((piece) => piece.id === selectedPieceId) ?? null;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        cursor: isPanning
          ? "grabbing"
          : activeTool === "draw"
            ? "crosshair"
            : "grab",
      }}
    >
      <Toolbar
        activeTool={activeTool}
        canRedo={canRedo}
        canCreateSymmetry={Boolean(selectedPiece && !selectedPiece.symmetry)}
        canUndo={canUndo}
        draftPointCount={draftPoints.length}
        onCancelDraft={cancelDraftPiece}
        onCreateSymmetry={createSymmetricPiece}
        onRedo={redo}
        onFinishDraft={finishDraftPiece}
        onSelectTool={setActiveTool}
        onUndo={undo}
      />

      {selectedPiece && (
        <PieceInspector
          piece={selectedPiece}
          onClose={clearSelection}
          onUpdateMetadata={updatePieceMetadata}
        />
      )}

      <PatternCanvas
        activeTool={activeTool}
        camera={camera}
        draftCursor={draftCursor}
        draftPoints={draftPoints}
        isPanning={isPanning}
        lastPointerPosition={lastPointerPosition}
        makeId={makeId}
        pieces={pieces}
        focusedPointId={
          focusedPoint?.pieceId === selectedPieceId ? focusedPoint.pointId : null
        }
        selectedPieceId={selectedPieceId}
        viewport={viewport}
        onAddDraftPoint={(point) =>
          setDraftPoints((currentPoints) => [...currentPoints, point])
        }
        onClearSelection={clearSelection}
        onClearBezierSegment={clearBezierSegment}
        onFocusPatternPoint={focusPatternPoint}
        onInsertPatternPoint={insertPatternPoint}
        onSelectPiece={selectPiece}
        onSetCamera={setCamera}
        onSetDraftCursor={setDraftCursor}
        onSetIsPanning={setIsPanning}
        onSetLastPointerPosition={setLastPointerPosition}
        onUpdateCurveHandle={updateCurveHandle}
        onUpdatePatternPoint={updatePatternPoint}
        onUpdatePiecePosition={updatePiecePosition}
      />
    </div>
  );
}

export default App;

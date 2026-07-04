import { useCallback, useEffect, useRef, useState } from "react";

import { PatternCanvas } from "./components/PatternCanvas";
import { PieceInspector } from "./components/PieceInspector";
import { Toolbar } from "./components/Toolbar";
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
  const [pieces, setPieces] = useState<PatternPiece[]>([createInitialPiece()]);
  const [draftPoints, setDraftPoints] = useState<PatternPoint[]>([]);
  const [draftCursor, setDraftCursor] = useState<PointPosition | null>(null);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [focusedPoint, setFocusedPoint] = useState<FocusedPoint | null>(null);
  const nextId = useRef(1);

  function makeId(prefix: string) {
    const id = `${prefix}-${nextId.current}`;
    nextId.current += 1;
    return id;
  }

  function updatePatternPoint(
    pieceId: string,
    pointId: string,
    x: number,
    y: number,
  ) {
    setPieces((currentPieces) =>
      currentPieces.map((piece) => {
        if (piece.id !== pieceId) {
          return piece;
        }

        return {
          ...piece,
          points: piece.points.map((point) => {
            if (point.id !== pointId) {
              return point;
            }

            const deltaX = x - point.x;
            const deltaY = y - point.y;

            return {
              ...point,
              x,
              y,
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
          }),
        };
      }),
    );
  }

  function focusPatternPoint(pieceId: string, pointId: string) {
    setSelectedPieceId(pieceId);
    setFocusedPoint({ pieceId, pointId });

    setPieces((currentPieces) =>
      currentPieces.map((piece) => {
        if (piece.id !== pieceId) {
          return piece;
        }

        const pointIndex = piece.points.findIndex(
          (point) => point.id === pointId,
        );

        if (pointIndex === -1) {
          return piece;
        }

        const point = piece.points[pointIndex];

        if (point.curveIn && point.curveOut) {
          return piece;
        }

        const previous =
          piece.points[(pointIndex - 1 + piece.points.length) % piece.points.length];
        const next = piece.points[(pointIndex + 1) % piece.points.length];

        return {
          ...piece,
          points: piece.points.map((currentPoint) =>
            currentPoint.id === pointId
              ? {
                  ...currentPoint,
                  curveIn: currentPoint.curveIn ?? {
                    x: currentPoint.x + (previous.x - currentPoint.x) / 3,
                    y: currentPoint.y + (previous.y - currentPoint.y) / 3,
                  },
                  curveOut: currentPoint.curveOut ?? {
                    x: currentPoint.x + (next.x - currentPoint.x) / 3,
                    y: currentPoint.y + (next.y - currentPoint.y) / 3,
                  },
                }
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
    setPieces((currentPieces) =>
      currentPieces.map((piece) => {
        if (piece.id !== pieceId) {
          return piece;
        }

        return {
          ...piece,
          points: piece.points.map((point) =>
            point.id === pointId
              ? {
                  ...point,
                  [handle]: position,
                }
              : point,
          ),
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

    setPieces((currentPieces) =>
      currentPieces.map((piece) => {
        if (piece.id !== pieceId) {
          return piece;
        }

        const insertIndex = piece.points.findIndex(
          (currentPoint) => currentPoint.id === afterPointId,
        );

        if (insertIndex === -1) {
          return piece;
        }

        return {
          ...piece,
          points: [
            ...piece.points.slice(0, insertIndex + 1),
            newPoint,
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

    setPieces((currentPieces) =>
      currentPieces.map((currentPiece) =>
        currentPiece.id === pieceId
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
  }, [pieces]);

  function updatePiecePosition(pieceId: string, x: number, y: number) {
    setPieces((currentPieces) =>
      currentPieces.map((piece) =>
        piece.id === pieceId
          ? {
              ...piece,
              x,
              y,
            }
          : piece,
      ),
    );
  }

  function updatePieceMetadata(pieceId: string, metadata: PieceMetadata) {
    setPieces((currentPieces) =>
      currentPieces.map((piece) =>
        piece.id === pieceId
          ? {
              ...piece,
              ...metadata,
            }
          : piece,
      ),
    );
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

    setPieces((currentPieces) => [
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
  }, [draftPoints]);

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
        draftPointCount={draftPoints.length}
        onCancelDraft={cancelDraftPiece}
        onFinishDraft={finishDraftPiece}
        onSelectTool={setActiveTool}
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

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
          points: piece.points.map((point) =>
            point.id === pointId ? { ...point, x, y } : point,
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

  function deletePatternPoint(pieceId: string, pointId: string) {
    setPieces((currentPieces) =>
      currentPieces.map((piece) => {
        if (piece.id !== pieceId || piece.points.length <= 3) {
          return piece;
        }

        return {
          ...piece,
          points: piece.points.filter((point) => point.id !== pointId),
        };
      }),
    );
  }

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
    setActiveTool("select");
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
          onClose={() => setSelectedPieceId(null)}
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
        selectedPieceId={selectedPieceId}
        viewport={viewport}
        onAddDraftPoint={(point) =>
          setDraftPoints((currentPoints) => [...currentPoints, point])
        }
        onClearSelection={() => setSelectedPieceId(null)}
        onDeletePatternPoint={deletePatternPoint}
        onInsertPatternPoint={insertPatternPoint}
        onSelectPiece={setSelectedPieceId}
        onSetCamera={setCamera}
        onSetDraftCursor={setDraftCursor}
        onSetIsPanning={setIsPanning}
        onSetLastPointerPosition={setLastPointerPosition}
        onUpdatePatternPoint={updatePatternPoint}
        onUpdatePiecePosition={updatePiecePosition}
      />
    </div>
  );
}

export default App;

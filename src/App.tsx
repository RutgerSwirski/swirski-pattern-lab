import { useEffect, useState } from "react";

import { PatternCanvas } from "./components/PatternCanvas";
import { PieceInspector } from "./components/PieceInspector";
import { Toolbar } from "./components/Toolbar";
import { usePatternEditor } from "./hooks/usePatternEditor";
import type { Camera, PointPosition, Viewport } from "./types";

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

  const editor = usePatternEditor();

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

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        cursor: isPanning
          ? "grabbing"
          : editor.activeTool === "draw"
            ? "crosshair"
            : "grab",
      }}
    >
      <Toolbar
        activeTool={editor.activeTool}
        canRedo={editor.canRedo}
        canCreateSymmetry={Boolean(
          editor.selectedPiece && !editor.selectedPiece.symmetry,
        )}
        canUndo={editor.canUndo}
        draftPointCount={editor.draftPoints.length}
        onCancelDraft={editor.cancelDraftPiece}
        onCreateSymmetry={editor.createSymmetricPiece}
        onRedo={editor.redo}
        onFinishDraft={editor.finishDraftPiece}
        onSelectTool={editor.setActiveTool}
        onUndo={editor.undo}
      />

      {editor.selectedPiece && (
        <PieceInspector
          piece={editor.selectedPiece}
          onClose={editor.clearSelection}
          onUpdateMetadata={editor.updatePieceMetadata}
        />
      )}

      <PatternCanvas
        activeTool={editor.activeTool}
        camera={camera}
        draftCursor={editor.draftCursor}
        draftPoints={editor.draftPoints}
        isPanning={isPanning}
        lastPointerPosition={lastPointerPosition}
        makeId={editor.makeId}
        pieces={editor.pieces}
        focusedPointIds={
          editor.focusedPoint?.pieceId === editor.selectedPieceId
            ? editor.focusedPoint.pointIds
            : []
        }
        selectedPieceId={editor.selectedPieceId}
        viewport={viewport}
        onAddDraftPoint={(point) =>
          editor.setDraftPoints((currentPoints) => [...currentPoints, point])
        }
        onClearSelection={editor.clearSelection}
        onClearBezierSegment={editor.clearBezierSegment}
        onFocusPatternPoint={editor.focusPatternPoint}
        onFocusPatternPoints={editor.focusPatternPoints}
        onInsertPatternPoint={editor.insertPatternPoint}
        onSelectPiece={editor.selectPiece}
        onSetCamera={setCamera}
        onSetDraftCursor={editor.setDraftCursor}
        onSetIsPanning={setIsPanning}
        onSetLastPointerPosition={setLastPointerPosition}
        onUpdateCurveHandle={editor.updateCurveHandle}
        onUpdatePatternPoint={editor.updatePatternPoint}
        onUpdatePiecePosition={editor.updatePiecePosition}
      />
    </div>
  );
}

export default App;

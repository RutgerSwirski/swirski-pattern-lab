import { useEffect, useState } from "react";

import { PatternCanvas } from "./components/PatternCanvas";
import { PieceInspector } from "./components/PieceInspector";
import { PieceToolBar } from "./components/PieceToolBar";
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
            : editor.selectedPiece && editor.pieceTool === "add-point"
              ? "crosshair"
            : "grab",
      }}
    >
      <Toolbar
        activeTool={editor.activeTool}
        canRedo={editor.canRedo}
        canUndo={editor.canUndo}
        draftPointCount={editor.draftPoints.length}
        onCancelDraft={editor.cancelDraftPiece}
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

      {editor.activeTool === "select" && editor.selectedPiece && (
        <PieceToolBar
          activeTool={editor.pieceTool}
          canCreateSymmetry={!editor.selectedPiece.symmetry}
          onCreateSymmetry={editor.createSymmetricPiece}
          onSelectTool={editor.setPieceTool}
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
        pieceTool={editor.pieceTool}
        pieces={editor.pieces}
        focusedCurveHandles={
          editor.focusedPoint?.pieceId === editor.selectedPieceId
            ? editor.focusedPoint.curveHandles
            : []
        }
        selectedPieceId={editor.selectedPieceId}
        viewport={viewport}
        onAddDraftPoint={(point) =>
          editor.setDraftPoints((currentPoints) => [...currentPoints, point])
        }
        onBendPatternSegment={editor.bendPatternSegment}
        onBeginHistoryTransaction={editor.beginHistoryTransaction}
        onClearSelection={editor.clearSelection}
        onClearBezierSegment={editor.clearBezierSegment}
        onCommitHistoryTransaction={editor.commitHistoryTransaction}
        onFocusPatternPoint={editor.focusPatternPoint}
        onFocusPatternSegment={editor.focusPatternSegment}
        onInsertPatternPoint={editor.insertPatternPoint}
        onSelectPiece={editor.selectPiece}
        onSelectPieceTool={editor.setPieceTool}
        onSetCamera={setCamera}
        onSetDraftCursor={editor.setDraftCursor}
        onSetIsPanning={setIsPanning}
        onSetLastPointerPosition={setLastPointerPosition}
        onTranslatePatternSegment={editor.translatePatternSegment}
        onUpdateCurveHandle={editor.updateCurveHandle}
        onUpdatePatternPoint={editor.updatePatternPoint}
        onUpdatePiecePosition={editor.updatePiecePosition}
      />
    </div>
  );
}

export default App;

import { useEffect, useRef, useState } from "react";

import { PatternCanvas } from "./components/PatternCanvas";
import { PieceInspector } from "./components/PieceInspector";
import { PieceToolBar } from "./components/PieceToolBar";
import { ThreePreview } from "./components/ThreePreview";
import { Toolbar } from "./components/Toolbar";
import { usePatternEditor } from "./hooks/usePatternEditor";
import type { Camera, PointPosition, Viewport } from "./types";
import { MM_TO_PX } from "./lib/patternConfig";

function App() {
  const editorPanelRef = useRef<HTMLDivElement>(null);

  const [viewport, setViewport] = useState<Viewport>({
    width: 0,
    height: 0,
  });

  const [camera, setCamera] = useState<Camera>({
    x: 0,
    y: 0,
    scale: 1,
  });

  const [isPanning, setIsPanning] = useState(false);
  const [lastPointerPosition, setLastPointerPosition] =
    useState<PointPosition | null>(null);

  const [baseAnimation, setBaseAnimation] = useState("idle");

  const [additiveWeights, setAdditiveWeights] = useState({
    sneak_pose: 0,
    sad_pose: 0,
    agree: 0,
    headShake: 0,
  });

  const editor = usePatternEditor();

  useEffect(() => {
    const element = editorPanelRef.current;

    if (!element) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const nextViewport = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };

      setViewport((previousViewport) => {
        // Keeps the same pattern area centred when the panel changes width.
        setCamera((previousCamera) => ({
          ...previousCamera,
          x:
            previousCamera.x +
            (nextViewport.width - previousViewport.width) / 2,
          y:
            previousCamera.y +
            (nextViewport.height - previousViewport.height) / 2,
        }));

        return nextViewport;
      });
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <main className="app-shell">
      <section
        ref={editorPanelRef}
        className="pattern-panel"
        style={{
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
            editor.setDraftPoints((points) => [...points, point])
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
      </section>

      <aside className="preview-panel">
        <ThreePreview
          modelUrl="/models/swirski_avatar_static_source_test_1.glb"
          pieces={editor.pieces}
          selectedPieceId={editor.selectedPieceId}
          patternUnitsPerMillimetre={MM_TO_PX}
        >
          {/*
      Later:

      <GarmentPreview
        pieces={editor.pieces}
        avatarSkeleton={...}
      />
    */}
        </ThreePreview>
      </aside>
    </main>
  );
}

export default App;

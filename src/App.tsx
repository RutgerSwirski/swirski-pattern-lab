import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { PatternCanvas } from "./components/PatternCanvas";
import { PieceInspector } from "./components/PieceInspector";
import { PieceToolBar } from "./components/PieceToolBar";
import { ThreePreview } from "./components/ThreePreview";
import { Toolbar } from "./components/Toolbar";
import { usePatternEditor } from "./hooks/usePatternEditor";
import type { Camera, PointPosition, Viewport } from "./types";
import { MM_TO_PX } from "./lib/patternConfig";

const MIN_PATTERN_PANEL_WIDTH = 360;
const MIN_PREVIEW_PANEL_WIDTH = 360;
const DIVIDER_WIDTH = 10;

function App() {
  const appShellRef = useRef<HTMLElement>(null);
  const editorPanelRef = useRef<HTMLElement>(null);

  const resizeStateRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  const [patternPanelWidth, setPatternPanelWidth] = useState(() =>
    Math.round(window.innerWidth / 2),
  );

  const [isResizingPanels, setIsResizingPanels] = useState(false);

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

  const editor = usePatternEditor();

  const clampPatternPanelWidth = useCallback((requestedWidth: number) => {
    const shellWidth = appShellRef.current?.clientWidth ?? window.innerWidth;

    const maxPatternPanelWidth = Math.max(
      MIN_PATTERN_PANEL_WIDTH,
      shellWidth - MIN_PREVIEW_PANEL_WIDTH - DIVIDER_WIDTH,
    );

    return Math.min(
      Math.max(requestedWidth, MIN_PATTERN_PANEL_WIDTH),
      maxPatternPanelWidth,
    );
  }, []);

  const handleDividerPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();

    event.currentTarget.setPointerCapture(event.pointerId);

    resizeStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: patternPanelWidth,
    };

    setIsResizingPanels(true);
  };

  const handleDividerPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const resizeState = resizeStateRef.current;

    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return;
    }

    const horizontalMovement = event.clientX - resizeState.startX;

    setPatternPanelWidth(
      clampPatternPanelWidth(resizeState.startWidth + horizontalMovement),
    );
  };

  const finishPanelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resizeState = resizeStateRef.current;

    if (resizeState?.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    resizeStateRef.current = null;
    setIsResizingPanels(false);
  };

  useEffect(() => {
    const shell = appShellRef.current;

    if (!shell) {
      return;
    }

    const observer = new ResizeObserver(() => {
      setPatternPanelWidth((currentWidth) =>
        clampPatternPanelWidth(currentWidth),
      );
    });

    observer.observe(shell);

    return () => observer.disconnect();
  }, [clampPatternPanelWidth]);

  useEffect(() => {
    const editorPanel = editorPanelRef.current;

    if (!editorPanel) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const nextViewport = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };

      setViewport((previousViewport) => {
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

    observer.observe(editorPanel);

    return () => observer.disconnect();
  }, []);

  return (
    <main
      ref={appShellRef}
      className={`app-shell ${isResizingPanels ? "is-resizing" : ""}`}
      style={{
        gridTemplateColumns: `${patternPanelWidth}px ${DIVIDER_WIDTH}px minmax(0, 1fr)`,
      }}
    >
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

      <div
        className="panel-divider"
        role="separator"
        aria-label="Resize pattern editor and 3D preview"
        aria-orientation="vertical"
        aria-valuenow={Math.round(patternPanelWidth)}
        tabIndex={0}
        onPointerDown={handleDividerPointerDown}
        onPointerMove={handleDividerPointerMove}
        onPointerUp={finishPanelResize}
        onPointerCancel={finishPanelResize}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 80 : 20;

          if (event.key === "ArrowLeft") {
            event.preventDefault();
            setPatternPanelWidth((width) =>
              clampPatternPanelWidth(width - step),
            );
          }

          if (event.key === "ArrowRight") {
            event.preventDefault();
            setPatternPanelWidth((width) =>
              clampPatternPanelWidth(width + step),
            );
          }
        }}
      />

      <aside className="preview-panel">
        <ThreePreview
          modelUrl="/models/swirski_avatar_static_source_test_1.glb"
          pieces={editor.pieces}
          selectedPieceId={editor.selectedPieceId}
          patternUnitsPerMillimetre={MM_TO_PX}
          onSelectPiece={editor.selectPiece}
          onUpdatePiecePreviewTransform={editor.updatePiecePreviewTransform}
          onClearSelection={editor.clearSelection}
          onUpdatePiecePreviewTransforms={editor.updatePiecePreviewTransforms}
        />
      </aside>
    </main>
  );
}

export default App;

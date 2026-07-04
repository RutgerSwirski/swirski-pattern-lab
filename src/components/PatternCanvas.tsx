import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { Group, Layer, Stage } from "react-konva";

import { snapToGrid } from "../lib/geometry";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  MM_TO_PX,
  ZOOM_STEP,
} from "../lib/patternConfig";
import type {
  Camera,
  PatternPiece,
  PatternPoint,
  PointPosition,
  Tool,
  Viewport,
} from "../types";
import { CanvasHud } from "./CanvasHud";
import { DraftPreview } from "./DraftPreview";
import { GridLayer } from "./GridLayer";
import { PatternPieceNode } from "./PatternPieceNode";

type PatternCanvasProps = {
  activeTool: Tool;
  camera: Camera;
  draftCursor: PointPosition | null;
  draftPoints: PatternPoint[];
  isPanning: boolean;
  lastPointerPosition: PointPosition | null;
  pieces: PatternPiece[];
  focusedPointIds: string[];
  selectedPieceId: string | null;
  viewport: Viewport;
  makeId: (prefix: string) => string;
  onAddDraftPoint: (point: PatternPoint) => void;
  onClearBezierSegment: (pieceId: string, startPointId: string) => void;
  onClearSelection: () => void;
  onFocusPatternPoint: (pieceId: string, pointId: string) => void;
  onFocusPatternPoints: (pieceId: string, pointIds: string[]) => void;
  onInsertPatternPoint: (
    pieceId: string,
    afterPointId: string,
    point: PointPosition,
  ) => void;
  onSelectPiece: (pieceId: string) => void;
  onSetCamera: Dispatch<SetStateAction<Camera>>;
  onSetDraftCursor: (point: PointPosition | null) => void;
  onSetIsPanning: (isPanning: boolean) => void;
  onSetLastPointerPosition: (point: PointPosition | null) => void;
  onUpdateCurveHandle: (
    pieceId: string,
    pointId: string,
    handle: "curveIn" | "curveOut",
    position: PointPosition,
  ) => void;
  onUpdatePatternPoint: (
    pieceId: string,
    pointId: string,
    x: number,
    y: number,
  ) => void;
  onUpdatePiecePosition: (pieceId: string, x: number, y: number) => void;
};

export function PatternCanvas({
  activeTool,
  camera,
  draftCursor,
  draftPoints,
  isPanning,
  lastPointerPosition,
  pieces,
  focusedPointIds,
  selectedPieceId,
  viewport,
  makeId,
  onAddDraftPoint,
  onClearBezierSegment,
  onClearSelection,
  onFocusPatternPoint,
  onFocusPatternPoints,
  onInsertPatternPoint,
  onSelectPiece,
  onSetCamera,
  onSetDraftCursor,
  onSetIsPanning,
  onSetLastPointerPosition,
  onUpdateCurveHandle,
  onUpdatePatternPoint,
  onUpdatePiecePosition,
}: PatternCanvasProps) {
  const [contextMenu, setContextMenu] = useState<{
    pieceId: string;
    startPointId: string;
    x: number;
    y: number;
  } | null>(null);

  function screenToPatternPoint(screenPoint: PointPosition) {
    return {
      x: snapToGrid((screenPoint.x - camera.x) / (MM_TO_PX * camera.scale)),
      y: snapToGrid((screenPoint.y - camera.y) / (MM_TO_PX * camera.scale)),
    };
  }

  function screenToPiecePoint(piece: PatternPiece, screenPoint: PointPosition) {
    return {
      x: (screenPoint.x - camera.x) / (MM_TO_PX * camera.scale) - piece.x,
      y: (screenPoint.y - camera.y) / (MM_TO_PX * camera.scale) - piece.y,
    };
  }

  return (
    <>
      <div
        onContextMenu={(event) => {
          event.preventDefault();
        }}
      >
        <Stage
          width={viewport.width}
          height={viewport.height}
          onWheel={(event) => {
        event.evt.preventDefault();

        const stage = event.target.getStage();
        const pointer = stage?.getPointerPosition();

        if (!pointer) {
          return;
        }

        if (!event.evt.ctrlKey) {
          onSetCamera((currentCamera) => ({
            ...currentCamera,
            x: currentCamera.x - event.evt.deltaX,
            y: currentCamera.y - event.evt.deltaY,
          }));
          return;
        }

        onSetCamera((currentCamera) => {
          const zoomDirection = event.evt.deltaY > 0 ? -1 : 1;

          const newScale = Math.min(
            MAX_ZOOM,
            Math.max(
              MIN_ZOOM,
              currentCamera.scale * Math.pow(ZOOM_STEP, zoomDirection),
            ),
          );

          const worldPointUnderCursor = {
            x: (pointer.x - currentCamera.x) / currentCamera.scale,
            y: (pointer.y - currentCamera.y) / currentCamera.scale,
          };

          return {
            scale: newScale,
            x: pointer.x - worldPointUnderCursor.x * newScale,
            y: pointer.y - worldPointUnderCursor.y * newScale,
          };
        });
          }}
          onMouseDown={(event) => {
        setContextMenu(null);

        const stage = event.target.getStage();

        if (!stage) {
          return;
        }

        const pointer = stage.getPointerPosition();

        if (!pointer) {
          return;
        }

        if (activeTool === "select" && event.target === stage) {
          onClearSelection();
          onSetIsPanning(true);
          onSetLastPointerPosition(pointer);
          return;
        }

        if (activeTool !== "draw" || event.target !== stage) {
          return;
        }

        const point = screenToPatternPoint(pointer);

        onAddDraftPoint({
          id: makeId("point"),
          ...point,
        });
          }}
          onMouseMove={(event) => {
        const pointer = event.target.getStage()?.getPointerPosition();

        if (!pointer) {
          return;
        }

        if (activeTool === "draw" && !isPanning) {
          onSetDraftCursor(screenToPatternPoint(pointer));
        }

        if (!isPanning || !lastPointerPosition) {
          return;
        }

        const deltaX = pointer.x - lastPointerPosition.x;
        const deltaY = pointer.y - lastPointerPosition.y;

        onSetCamera((currentCamera) => ({
          ...currentCamera,
          x: currentCamera.x + deltaX,
          y: currentCamera.y + deltaY,
        }));

        onSetLastPointerPosition(pointer);
          }}
          onMouseUp={() => {
        onSetIsPanning(false);
        onSetLastPointerPosition(null);
          }}
          onMouseLeave={() => {
        onSetIsPanning(false);
        onSetLastPointerPosition(null);
          }}
        >
      <GridLayer camera={camera} viewport={viewport} />

      <Layer>
        <Group
          x={camera.x}
          y={camera.y}
          scaleX={MM_TO_PX * camera.scale}
          scaleY={MM_TO_PX * camera.scale}
        >
          {pieces.map((piece) => (
            <PatternPieceNode
              key={piece.id}
              activeTool={activeTool}
              camera={camera}
              focusedPointIds={focusedPointIds}
              isSelected={piece.id === selectedPieceId}
              piece={piece}
              screenToPiecePoint={screenToPiecePoint}
              onOpenBezierContextMenu={(event, startPointId) => {
                event.cancelBubble = true;
                event.evt.preventDefault();
                event.evt.stopPropagation();

                setContextMenu({
                  pieceId: piece.id,
                  startPointId,
                  x: event.evt.clientX,
                  y: event.evt.clientY,
                });
              }}
              onFocusPatternPoint={onFocusPatternPoint}
              onFocusPatternPoints={onFocusPatternPoints}
              onInsertPatternPoint={onInsertPatternPoint}
              onSelectPiece={onSelectPiece}
              onUpdatePatternPoint={onUpdatePatternPoint}
              onUpdateCurveHandle={onUpdateCurveHandle}
              onUpdatePiecePosition={onUpdatePiecePosition}
            />
          ))}

          <DraftPreview
            camera={camera}
            draftCursor={draftCursor}
            draftPoints={draftPoints}
          />
        </Group>
      </Layer>

      <CanvasHud camera={camera} viewport={viewport} />

        </Stage>
      </div>

      {contextMenu && (
        <div
          className="context-menu"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            onClick={() => {
              onClearBezierSegment(
                contextMenu.pieceId,
                contextMenu.startPointId,
              );
              setContextMenu(null);
            }}
          >
            Make line straight
          </button>
        </div>
      )}
    </>
  );
}

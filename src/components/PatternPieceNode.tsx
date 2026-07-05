import type Konva from "konva";
import { Group, Shape, Text } from "react-konva";

import { drawPatternOutline, snapToGrid } from "../lib/geometry";
import type {
  Camera,
  FocusedCurveHandle,
  PatternEdgeRef,
  PatternPiece,
  PieceTool,
  PointPosition,
  Tool,
} from "../types";
import { PatternAngleLabels } from "./PatternAngleLabels";
import { PatternCurveHandles } from "./PatternCurveHandles";
import { PatternPieceEdges } from "./PatternPieceEdges";
import { PatternPointNodes } from "./PatternPointNodes";

type PatternPieceNodeProps = {
  activeTool: Tool;
  camera: Camera;
  focusedCurveHandles: FocusedCurveHandle[];
  isSelected: boolean;
  pieceTool: PieceTool;
  piece: PatternPiece;
  screenToPiecePoint: (
    piece: PatternPiece,
    screenPoint: PointPosition,
  ) => PointPosition;
  onOpenBezierContextMenu: (
    event: Konva.KonvaEventObject<PointerEvent>,
    startPointId: string,
  ) => void;
  onBendPatternSegment: (
    pieceId: string,
    startPointId: string,
    endPointId: string,
    bendPoint: PointPosition,
  ) => void;
  onBeginHistoryTransaction: () => void;
  onCommitHistoryTransaction: () => void;
  onFocusPatternPoint: (pieceId: string, pointId: string) => void;
  onFocusPatternSegment: (
    pieceId: string,
    startPointId: string,
    endPointId: string,
  ) => void;
  onInsertPatternPoint: (
    pieceId: string,
    afterPointId: string,
    point: PointPosition,
    progress?: number,
  ) => void;
  onSelectPiece: (pieceId: string) => void;
  onSelectPieceTool: (tool: PieceTool) => void;
  onTranslatePatternSegment: (
    pieceId: string,
    startPointId: string,
    endPointId: string,
    deltaX: number,
    deltaY: number,
  ) => void;
  onUpdatePatternPoint: (
    pieceId: string,
    pointId: string,
    x: number,
    y: number,
  ) => void;
  onUpdateCurveHandle: (
    pieceId: string,
    pointId: string,
    handle: "curveIn" | "curveOut",
    position: PointPosition,
  ) => void;
  onUpdatePiecePosition: (pieceId: string, x: number, y: number) => void;
  onSelectSeamEdge: (edge: PatternEdgeRef) => void;
};

export function PatternPieceNode({
  activeTool,
  camera,
  focusedCurveHandles,
  isSelected,
  pieceTool,
  piece,
  screenToPiecePoint,
  onOpenBezierContextMenu,
  onBendPatternSegment,
  onBeginHistoryTransaction,
  onCommitHistoryTransaction,
  onFocusPatternPoint,
  onFocusPatternSegment,
  onInsertPatternPoint,
  onSelectPiece,
  onSelectPieceTool,
  onTranslatePatternSegment,
  onUpdatePatternPoint,
  onUpdateCurveHandle,
  onUpdatePiecePosition,
  onSelectSeamEdge,
}: PatternPieceNodeProps) {
  const canMoveGeometry =
    activeTool === "select" && isSelected && pieceTool === "move";
  const canEditCurves =
    activeTool === "select" && isSelected && pieceTool === "curve";

  return (
    <Group
      key={piece.id}
      x={piece.x}
      y={piece.y}
      draggable={canMoveGeometry}
      onClick={() => {
        if (activeTool === "select") {
          onSelectPiece(piece.id);
        }
      }}
      onTap={() => {
        if (activeTool === "select") {
          onSelectPiece(piece.id);
        }
      }}
      onDragStart={() => {
        onBeginHistoryTransaction();
        onSelectPiece(piece.id);
      }}
      onDragMove={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }

        const x = snapToGrid(event.target.x());
        const y = snapToGrid(event.target.y());

        onUpdatePiecePosition(piece.id, x, y);
        event.target.position({ x, y });
      }}
      onDragEnd={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }

        const x = snapToGrid(event.target.x());
        const y = snapToGrid(event.target.y());

        onUpdatePiecePosition(piece.id, x, y);
        event.target.position({ x, y });
        onCommitHistoryTransaction();
      }}
    >
      <Shape
        sceneFunc={(context, shape) => {
          drawPatternOutline(
            context,
            shape,
            piece.points,
            piece.cornerRadiusMm,
          );
        }}
        fill={
          isSelected ? "rgba(220, 235, 255, 0.9)" : "rgba(255, 255, 255, 0.85)"
        }
        stroke={isSelected ? "#2563eb" : "#171717"}
        strokeWidth={(isSelected ? 1.5 : 1) / camera.scale}
      />

      {(isSelected || activeTool === "sew") && (
        <PatternPieceEdges
          activeTool={activeTool}
          camera={camera}
          pieceTool={pieceTool}
          piece={piece}
          screenToPiecePoint={screenToPiecePoint}
          onBeginHistoryTransaction={onBeginHistoryTransaction}
          onBendPatternSegment={onBendPatternSegment}
          onCommitHistoryTransaction={onCommitHistoryTransaction}
          onFocusPatternSegment={onFocusPatternSegment}
          onInsertPatternPoint={onInsertPatternPoint}
          onOpenBezierContextMenu={onOpenBezierContextMenu}
          onSelectPieceTool={onSelectPieceTool}
          onSelectSeamEdge={onSelectSeamEdge}
          onTranslatePatternSegment={onTranslatePatternSegment}
        />
      )}

      {isSelected && <PatternAngleLabels camera={camera} piece={piece} />}

      {isSelected && (
        <PatternPointNodes
          camera={camera}
          canMoveGeometry={canMoveGeometry}
          piece={piece}
          onBeginHistoryTransaction={onBeginHistoryTransaction}
          onCommitHistoryTransaction={onCommitHistoryTransaction}
          onFocusPatternPoint={onFocusPatternPoint}
          onSelectPieceTool={onSelectPieceTool}
          onUpdatePatternPoint={onUpdatePatternPoint}
        />
      )}

      {isSelected && pieceTool === "curve" && (
        <PatternCurveHandles
          camera={camera}
          canEditCurves={canEditCurves}
          focusedCurveHandles={focusedCurveHandles}
          piece={piece}
          onBeginHistoryTransaction={onBeginHistoryTransaction}
          onCommitHistoryTransaction={onCommitHistoryTransaction}
          onUpdateCurveHandle={onUpdateCurveHandle}
        />
      )}

      <Text
        x={piece.points[0].x}
        y={piece.points[0].y - 18}
        text={piece.name.toUpperCase()}
        fontSize={12 / camera.scale}
        fill={isSelected ? "#2563eb" : "#555555"}
        listening={false}
      />

      {piece.cornerRadiusMm > 0 && (
        <Text
          x={piece.points[0].x}
          y={piece.points[0].y - 4}
          text={`R ${Math.round(piece.cornerRadiusMm)} mm`}
          fontSize={10 / camera.scale}
          fill={isSelected ? "#047857" : "#666666"}
          listening={false}
        />
      )}
    </Group>
  );
}

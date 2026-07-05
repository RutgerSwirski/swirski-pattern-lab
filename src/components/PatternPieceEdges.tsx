import type Konva from "konva";
import { useRef, useState } from "react";
import { Circle, Group, Line, Rect, Text } from "react-konva";

import {
  getClosestPointOnPatternSegment,
  getLineLength,
  getSegmentLabelGeometry,
  getSegmentLength,
} from "../lib/geometry";
import { MM_TO_PX } from "../lib/patternConfig";
import type {
  Camera,
  PatternPiece,
  PatternPoint,
  PieceTool,
  PointPosition,
  Tool,
} from "../types";

type PatternEdge = {
  id: string;
  start: PatternPoint;
  end: PatternPoint;
  isBezier: boolean;
  length: number;
  midpoint: PointPosition;
  normal: PointPosition;
  rotation: number;
};

type PatternPieceEdgesProps = {
  activeTool: Tool;
  camera: Camera;
  pieceTool: PieceTool;
  piece: PatternPiece;
  screenToPiecePoint: (
    piece: PatternPiece,
    screenPoint: PointPosition,
  ) => PointPosition;
  onBeginHistoryTransaction: () => void;
  onCommitHistoryTransaction: () => void;
  onFocusPatternPoints: (pieceId: string, pointIds: string[]) => void;
  onInsertPatternPoint: (
    pieceId: string,
    afterPointId: string,
    point: PointPosition,
    progress?: number,
  ) => void;
  onOpenBezierContextMenu: (
    event: Konva.KonvaEventObject<PointerEvent>,
    startPointId: string,
  ) => void;
  onSelectPieceTool: (tool: PieceTool) => void;
  onTranslatePatternSegment: (
    pieceId: string,
    startPointId: string,
    endPointId: string,
    deltaX: number,
    deltaY: number,
  ) => void;
};

export function PatternPieceEdges({
  activeTool,
  camera,
  pieceTool,
  piece,
  screenToPiecePoint,
  onBeginHistoryTransaction,
  onCommitHistoryTransaction,
  onFocusPatternPoints,
  onInsertPatternPoint,
  onOpenBezierContextMenu,
  onSelectPieceTool,
  onTranslatePatternSegment,
}: PatternPieceEdgesProps) {
  const [hoverPoint, setHoverPoint] = useState<{
    edgeId: string;
    point: PointPosition;
    progress: number;
  } | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeDragMoved = useRef(false);
  const edgeDragPointer = useRef<PointPosition | null>(null);
  const edgePointerButton = useRef<number | null>(null);
  const suppressEdgeClickUntil = useRef(0);
  const edges = getPatternEdges(piece);
  const canAddPoint = activeTool === "select" && pieceTool === "add-point";
  const canCurveSegment = activeTool === "select" && pieceTool === "curve";
  const canMoveSegment = activeTool === "select" && pieceTool === "move";

  return (
    <>
      {edges.map((edge) => {
        function getPointOnEdge(
          event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
        ): { point: PointPosition; progress: number } | null {
          const pointer = event.target.getStage()?.getPointerPosition();

          if (!pointer) {
            return null;
          }

          const localPointer = screenToPiecePoint(piece, pointer);

          return getClosestPointOnPatternSegment(
            localPointer,
            edge.start,
            edge.end,
          );
        }

        function isNearEdgeEndpoint(point: PointPosition) {
          return (
            getLineLength(point, edge.start) < 1 ||
            getLineLength(point, edge.end) < 1
          );
        }

        function handleEdgeClick(
          event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
        ) {
          event.cancelBubble = true;

          if (
            edgePointerButton.current !== null &&
            edgePointerButton.current !== 0
          ) {
            return;
          }

          if (Date.now() < suppressEdgeClickUntil.current) {
            suppressEdgeClickUntil.current = 0;
            return;
          }

          if ("detail" in event.evt && event.evt.detail > 1) {
            return;
          }

          if (canCurveSegment) {
            if (clickTimer.current) {
              clearTimeout(clickTimer.current);
              clickTimer.current = null;
            }

            onFocusPatternPoints(piece.id, [edge.start.id, edge.end.id]);
            return;
          }

          if (!canAddPoint) {
            return;
          }

          const newPoint =
            hoverPoint?.edgeId === edge.id ? hoverPoint : getPointOnEdge(event);

          if (!newPoint || isNearEdgeEndpoint(newPoint.point)) {
            return;
          }

          if (clickTimer.current) {
            clearTimeout(clickTimer.current);
          }

          clickTimer.current = setTimeout(() => {
            onInsertPatternPoint(
              piece.id,
              edge.start.id,
              newPoint.point,
              newPoint.progress,
            );
            clickTimer.current = null;
          }, 220);
        }

        function handleEdgeDoubleClick(
          event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
        ) {
          event.cancelBubble = true;

          if (edgePointerButton.current !== 0) {
            return;
          }

          if (clickTimer.current) {
            clearTimeout(clickTimer.current);
            clickTimer.current = null;
          }

          if ("altKey" in event.evt && event.evt.altKey && canAddPoint) {
            const newPoint = getPointOnEdge(event);

            if (!newPoint || isNearEdgeEndpoint(newPoint.point)) {
              return;
            }

            onInsertPatternPoint(
              piece.id,
              edge.start.id,
              newPoint.point,
              newPoint.progress,
            );
            return;
          }

          if (!canCurveSegment && pieceTool !== "move") {
            return;
          }

          onSelectPieceTool("curve");
          onFocusPatternPoints(piece.id, [edge.start.id, edge.end.id]);
        }

        function handleEdgeHover(
          event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
        ) {
          if (!canAddPoint || edgeDragPointer.current) {
            setHoverPoint((currentPoint) =>
              currentPoint?.edgeId === edge.id ? null : currentPoint,
            );
            return;
          }

          const newPoint = getPointOnEdge(event);

          if (!newPoint || isNearEdgeEndpoint(newPoint.point)) {
            setHoverPoint((currentPoint) =>
              currentPoint?.edgeId === edge.id ? null : currentPoint,
            );
            return;
          }

          setHoverPoint({ edgeId: edge.id, ...newPoint });
        }

        function handleEdgeDragMove(event: Konva.KonvaEventObject<DragEvent>) {
          event.cancelBubble = true;

          const pointer = event.target.getStage()?.getPointerPosition();

          if (!pointer || !edgeDragPointer.current) {
            event.target.position({ x: 0, y: 0 });
            return;
          }

          const localPointer = screenToPiecePoint(piece, pointer);
          const deltaX = localPointer.x - edgeDragPointer.current.x;
          const deltaY = localPointer.y - edgeDragPointer.current.y;

          if (deltaX === 0 && deltaY === 0) {
            event.target.position({ x: 0, y: 0 });
            return;
          }

          edgeDragMoved.current = true;
          edgeDragPointer.current = localPointer;
          onTranslatePatternSegment(
            piece.id,
            edge.start.id,
            edge.end.id,
            deltaX,
            deltaY,
          );
          event.target.position({ x: 0, y: 0 });
        }

        function handleEdgeDragEnd(event: Konva.KonvaEventObject<DragEvent>) {
          event.cancelBubble = true;
          suppressEdgeClickUntil.current = edgeDragMoved.current
            ? Date.now() + 250
            : 0;
          edgeDragMoved.current = false;
          edgeDragPointer.current = null;
          edgePointerButton.current = null;
          event.target.position({ x: 0, y: 0 });
          onCommitHistoryTransaction();
        }

        function handleEdgeMouseLeave() {
          edgePointerButton.current = null;
          setHoverPoint((currentPoint) =>
            currentPoint?.edgeId === edge.id ? null : currentPoint,
          );
        }

        return (
          <Line
            key={`insert-hit-${edge.id}`}
            points={[edge.start.x, edge.start.y, edge.end.x, edge.end.y]}
            stroke="rgba(37, 99, 235, 0.01)"
            strokeWidth={10 / camera.scale}
            hitStrokeWidth={14 / camera.scale}
            draggable={canMoveSegment}
            onMouseDown={(event) => {
              edgePointerButton.current = event.evt.button;

              if (event.evt.button !== 0) {
                event.evt.preventDefault();
                event.cancelBubble = true;
              }
            }}
            onTouchStart={() => {
              edgePointerButton.current = 0;
            }}
            onClick={handleEdgeClick}
            onTap={handleEdgeClick}
            onDblClick={handleEdgeDoubleClick}
            onDblTap={handleEdgeDoubleClick}
            onMouseMove={handleEdgeHover}
            onTouchMove={handleEdgeHover}
            onMouseLeave={handleEdgeMouseLeave}
            onDragStart={(event) => {
              event.cancelBubble = true;
              onBeginHistoryTransaction();
              edgeDragMoved.current = false;
              suppressEdgeClickUntil.current = 0;
              setHoverPoint(null);

              const pointer = event.target.getStage()?.getPointerPosition();
              edgeDragPointer.current = pointer
                ? screenToPiecePoint(piece, pointer)
                : null;
              event.target.position({ x: 0, y: 0 });
            }}
            onDragMove={handleEdgeDragMove}
            onDragEnd={handleEdgeDragEnd}
            onContextMenu={(event) => {
              edgePointerButton.current = 2;
              event.evt.preventDefault();
              event.cancelBubble = true;

              if (clickTimer.current) {
                clearTimeout(clickTimer.current);
                clickTimer.current = null;
              }

              if (edge.isBezier) {
                onOpenBezierContextMenu(event, edge.start.id);
              }
            }}
          />
        );
      })}

      {canAddPoint && hoverPoint && (
        <Circle
          x={hoverPoint.point.x}
          y={hoverPoint.point.y}
          radius={4 / camera.scale}
          fill="rgba(37, 99, 235, 0.16)"
          stroke="#2563eb"
          strokeWidth={1 / camera.scale}
          listening={false}
        />
      )}

      {edges.map((edge) => {
        const labelText = `${Math.round(edge.length)} mm`;
        const labelWidth = 58 / (MM_TO_PX * camera.scale);
        const labelHeight = 18 / (MM_TO_PX * camera.scale);
        const labelOffset = 13 / (MM_TO_PX * camera.scale);
        const labelX = edge.midpoint.x + edge.normal.x * labelOffset;
        const labelY = edge.midpoint.y + edge.normal.y * labelOffset;

        return (
          <Group
            key={edge.id}
            x={labelX}
            y={labelY}
            rotation={edge.rotation}
            listening={false}
          >
            <Rect
              x={-labelWidth / 2}
              y={-labelHeight / 2}
              width={labelWidth}
              height={labelHeight}
              fill="rgba(255, 255, 255, 0.94)"
              stroke="#93c5fd"
              strokeWidth={0.75 / camera.scale}
              cornerRadius={3 / camera.scale}
            />

            <Text
              x={-labelWidth / 2}
              y={-labelHeight / 2 + 2 / camera.scale}
              width={labelWidth}
              text={labelText}
              align="center"
              fontSize={10 / (MM_TO_PX * camera.scale)}
              fill="#1d4ed8"
            />
          </Group>
        );
      })}
    </>
  );
}

function getPatternEdges(piece: PatternPiece): PatternEdge[] {
  return piece.points
    .map((start, index) => {
      const end = piece.points[(index + 1) % piece.points.length];
      const chordLength = getLineLength(start, end);
      const labelGeometry = getSegmentLabelGeometry(start, end);

      if (chordLength === 0 || !labelGeometry) {
        return null;
      }

      return {
        id: `${start.id}-${end.id}`,
        start,
        end,
        isBezier: Boolean(start.curveOut || end.curveIn),
        length: getSegmentLength(start, end),
        midpoint: labelGeometry.midpoint,
        normal: labelGeometry.normal,
        rotation: labelGeometry.rotation,
      };
    })
    .filter((edge) => edge !== null);
}

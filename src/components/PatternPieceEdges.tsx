import type Konva from "konva";
import { useRef, useState } from "react";
import { Circle, Group, Rect, Shape, Text } from "react-konva";

import {
  getClosestPointOnPatternSegment,
  getGridSnappedTranslation,
  getLineLength,
  getSegmentLabelGeometry,
  getSegmentLength,
  getSegmentSplitLengths,
} from "../lib/geometry";
import { MM_TO_PX } from "../lib/patternConfig";
import type {
  Camera,
  PatternPiece,
  PatternPoint,
  PieceTool,
  PointPosition,
  Tool,
  PatternEdgeRef,
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
  onBendPatternSegment: (
    pieceId: string,
    startPointId: string,
    endPointId: string,
    bendPoint: PointPosition,
  ) => void;
  onCommitHistoryTransaction: () => void;
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

  onSelectSeamEdge: (edge: PatternEdgeRef) => void;
};

export function PatternPieceEdges({
  activeTool,
  camera,
  pieceTool,
  piece,
  screenToPiecePoint,
  onBeginHistoryTransaction,
  onBendPatternSegment,
  onCommitHistoryTransaction,
  onFocusPatternSegment,
  onInsertPatternPoint,
  onOpenBezierContextMenu,
  onSelectPieceTool,
  onTranslatePatternSegment,
  onSelectSeamEdge,
}: PatternPieceEdgesProps) {
  const [hoverPoint, setHoverPoint] = useState<{
    edgeId: string;
    point: PointPosition;
    progress: number;
  } | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeDragMoved = useRef(false);
  const edgeDragStartPointer = useRef<PointPosition | null>(null);
  const edgeDragStartPoint = useRef<PointPosition | null>(null);
  const edgeDragMode = useRef<"bend" | "move" | null>(null);
  const edgeDragSnappedOffset = useRef<PointPosition>({ x: 0, y: 0 });
  const edgePointerButton = useRef<number | null>(null);
  const suppressEdgeClickUntil = useRef(0);
  const edges = getPatternEdges(piece);
  const canAddPoint = activeTool === "select" && pieceTool === "add-point";
  const canCurveSegment = activeTool === "select" && pieceTool === "curve";
  const canBendSegment = canCurveSegment;
  const canMoveSegment = activeTool === "select" && pieceTool === "move";
  const hoverEdge =
    hoverPoint && canAddPoint
      ? (edges.find((edge) => edge.id === hoverPoint.edgeId) ?? null)
      : null;

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

          if (activeTool === "sew") {
            onSelectSeamEdge({
              pieceId: piece.id,
              startPointId: edge.start.id,
              endPointId: edge.end.id,
            });

            return;
          }

          if (canCurveSegment) {
            if (clickTimer.current) {
              clearTimeout(clickTimer.current);
              clickTimer.current = null;
            }

            onFocusPatternSegment(piece.id, edge.start.id, edge.end.id);
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

          if (activeTool === "sew") {
            return;
          }

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
          onFocusPatternSegment(piece.id, edge.start.id, edge.end.id);
        }

        function handleEdgeHover(
          event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
        ) {
          setHoveredEdgeId(edge.id);

          if (!canAddPoint || edgeDragStartPointer.current) {
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

          if (
            !pointer ||
            !edgeDragStartPointer.current ||
            (!edgeDragStartPoint.current && edgeDragMode.current === "move")
          ) {
            event.target.position({ x: 0, y: 0 });
            return;
          }

          const localPointer = screenToPiecePoint(piece, pointer);

          if (edgeDragMode.current === "bend") {
            edgeDragMoved.current = true;
            onBendPatternSegment(
              piece.id,
              edge.start.id,
              edge.end.id,
              localPointer,
            );
            event.target.position({ x: 0, y: 0 });
            return;
          }

          if (!edgeDragStartPoint.current) {
            event.target.position({ x: 0, y: 0 });
            return;
          }

          const rawOffset = {
            x: localPointer.x - edgeDragStartPointer.current.x,
            y: localPointer.y - edgeDragStartPointer.current.y,
          };
          const { delta, offset } = getGridSnappedTranslation(
            edgeDragStartPoint.current,
            rawOffset,
            edgeDragSnappedOffset.current,
          );
          const deltaX = delta.x;
          const deltaY = delta.y;

          if (deltaX === 0 && deltaY === 0) {
            event.target.position({ x: 0, y: 0 });
            return;
          }

          edgeDragMoved.current = true;
          edgeDragSnappedOffset.current = offset;
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
          edgeDragStartPointer.current = null;
          edgeDragStartPoint.current = null;
          edgeDragMode.current = null;
          edgeDragSnappedOffset.current = { x: 0, y: 0 };
          edgePointerButton.current = null;
          event.target.position({ x: 0, y: 0 });
          onCommitHistoryTransaction();
        }

        function handleEdgeMouseLeave() {
          edgePointerButton.current = null;
          setHoveredEdgeId((currentEdgeId) =>
            currentEdgeId === edge.id ? null : currentEdgeId,
          );
          setHoverPoint((currentPoint) =>
            currentPoint?.edgeId === edge.id ? null : currentPoint,
          );
        }

        return (
          <Group key={`edge-hit-${edge.id}`}>
            {hoveredEdgeId === edge.id && (
              <Shape
                sceneFunc={(context, shape) => {
                  drawEdgeHitPath(context, shape, edge);
                }}
                stroke="rgba(37, 99, 235, 0.42)"
                strokeWidth={4 / camera.scale}
                listening={false}
              />
            )}

            <Shape
              sceneFunc={(context, shape) => {
                drawEdgeHitPath(context, shape, edge);
              }}
              hitFunc={(context, shape) => {
                drawEdgeHitPath(context, shape, edge);
              }}
              stroke="rgba(37, 99, 235, 0.01)"
              strokeWidth={10 / camera.scale}
              hitStrokeWidth={14 / camera.scale}
              draggable={canMoveSegment || canBendSegment}
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
              onMouseEnter={() => setHoveredEdgeId(edge.id)}
              onMouseMove={handleEdgeHover}
              onTouchMove={handleEdgeHover}
              onMouseLeave={handleEdgeMouseLeave}
              onDragStart={(event) => {
                event.cancelBubble = true;
                onBeginHistoryTransaction();
                edgeDragMoved.current = false;
                edgeDragMode.current = canBendSegment ? "bend" : "move";
                suppressEdgeClickUntil.current = 0;
                setHoverPoint(null);
                setHoveredEdgeId(null);

                if (edgeDragMode.current === "bend") {
                  onFocusPatternSegment(piece.id, edge.start.id, edge.end.id);
                }

                const pointer = event.target.getStage()?.getPointerPosition();
                edgeDragStartPointer.current = pointer
                  ? screenToPiecePoint(piece, pointer)
                  : null;
                edgeDragStartPoint.current =
                  edgeDragMode.current === "move" ? edge.start : null;
                edgeDragSnappedOffset.current = { x: 0, y: 0 };
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
          </Group>
        );
      })}

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

      {canAddPoint && hoverPoint && (
        <Group x={hoverPoint.point.x} y={hoverPoint.point.y} listening={false}>
          {hoverEdge && (
            <SplitLengthPreview
              camera={camera}
              edge={hoverEdge}
              progress={hoverPoint.progress}
            />
          )}

          <Circle
            radius={7 / camera.scale}
            fill="rgba(37, 99, 235, 0.16)"
            stroke="#ffffff"
            strokeWidth={3 / camera.scale}
          />

          <Circle
            radius={4.5 / camera.scale}
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth={1.5 / camera.scale}
          />
        </Group>
      )}
    </>
  );
}

function SplitLengthPreview({
  camera,
  edge,
  progress,
}: {
  camera: Camera;
  edge: PatternEdge;
  progress: number;
}) {
  const lengths = getSegmentSplitLengths(edge.start, edge.end, progress);
  const labelWidth = 86 / (MM_TO_PX * camera.scale);
  const labelHeight = 18 / (MM_TO_PX * camera.scale);
  const labelY = -24 / (MM_TO_PX * camera.scale);
  const text = `${Math.round(lengths.first)} | ${Math.round(lengths.second)} mm`;

  return (
    <Group y={labelY}>
      <Rect
        x={-labelWidth / 2}
        y={-labelHeight / 2}
        width={labelWidth}
        height={labelHeight}
        fill="rgba(255, 255, 255, 0.96)"
        stroke="#2563eb"
        strokeWidth={0.85 / camera.scale}
        cornerRadius={3 / camera.scale}
      />

      <Text
        x={-labelWidth / 2}
        y={-labelHeight / 2 + 2 / camera.scale}
        width={labelWidth}
        text={text}
        align="center"
        fontSize={10 / (MM_TO_PX * camera.scale)}
        fill="#1d4ed8"
      />
    </Group>
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

function drawEdgeHitPath(
  context: Konva.Context,
  shape: Konva.Shape,
  edge: PatternEdge,
) {
  context.beginPath();
  context.moveTo(edge.start.x, edge.start.y);

  if (edge.isBezier) {
    const controlA = edge.start.curveOut ?? edge.start;
    const controlB = edge.end.curveIn ?? edge.end;

    context.bezierCurveTo(
      controlA.x,
      controlA.y,
      controlB.x,
      controlB.y,
      edge.end.x,
      edge.end.y,
    );
  } else {
    context.lineTo(edge.end.x, edge.end.y);
  }

  context.strokeShape(shape);
}

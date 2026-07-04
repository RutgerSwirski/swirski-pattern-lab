import type Konva from "konva";
import { useRef, useState } from "react";
import { Circle, Group, Line, Rect, Shape, Text } from "react-konva";

import {
  drawPatternOutline,
  getClosestPointOnSegment,
  getLineLength,
  getPointAngle,
  getPointAngleVectors,
  getSegmentLabelGeometry,
  getSegmentLength,
  snapToGrid,
} from "../lib/geometry";
import { MM_TO_PX } from "../lib/patternConfig";
import type { Camera, PatternPiece, PointPosition, Tool } from "../types";

type PatternPieceNodeProps = {
  activeTool: Tool;
  camera: Camera;
  focusedPointIds: string[];
  isSelected: boolean;
  piece: PatternPiece;
  screenToPiecePoint: (
    piece: PatternPiece,
    screenPoint: PointPosition,
  ) => PointPosition;
  onOpenBezierContextMenu: (
    event: Konva.KonvaEventObject<PointerEvent>,
    startPointId: string,
  ) => void;
  onFocusPatternPoint: (pieceId: string, pointId: string) => void;
  onFocusPatternPoints: (pieceId: string, pointIds: string[]) => void;
  onInsertPatternPoint: (
    pieceId: string,
    afterPointId: string,
    point: PointPosition,
  ) => void;
  onSelectPiece: (pieceId: string) => void;
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
};

export function PatternPieceNode({
  activeTool,
  camera,
  focusedPointIds,
  isSelected,
  piece,
  screenToPiecePoint,
  onOpenBezierContextMenu,
  onFocusPatternPoint,
  onFocusPatternPoints,
  onInsertPatternPoint,
  onSelectPiece,
  onTranslatePatternSegment,
  onUpdatePatternPoint,
  onUpdateCurveHandle,
  onUpdatePiecePosition,
}: PatternPieceNodeProps) {
  const [hoverPoint, setHoverPoint] = useState<{
    edgeId: string;
    point: PointPosition;
  } | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeDragMoved = useRef(false);
  const edgePointerButton = useRef<number | null>(null);

  const edges = piece.points
    .map((start, index) => {
      const end = piece.points[(index + 1) % piece.points.length];
      const chordLength = getLineLength(start, end);
      const length = getSegmentLength(start, end);
      const labelGeometry = getSegmentLabelGeometry(start, end);

      if (chordLength === 0 || !labelGeometry) {
        return null;
      }

      return {
        id: `${start.id}-${end.id}`,
        start,
        end,
        isBezier: Boolean(start.curveOut || end.curveIn),
        length,
        midpoint: labelGeometry.midpoint,
        normal: labelGeometry.normal,
        rotation: labelGeometry.rotation,
      };
    })
    .filter((edge) => edge !== null);

  const angles = piece.points
    .map((point, index) => {
      const previous =
        piece.points[(index - 1 + piece.points.length) % piece.points.length];
      const next = piece.points[(index + 1) % piece.points.length];
      const angle = getPointAngle(previous, point, next);

      if (angle === null) {
        return null;
      }

      const { previousVector, nextVector } = getPointAngleVectors(
        previous,
        point,
        next,
      );

      const previousLength = Math.hypot(previousVector.x, previousVector.y);
      const nextLength = Math.hypot(nextVector.x, nextVector.y);

      const direction = {
        x: previousVector.x / previousLength + nextVector.x / nextLength,
        y: previousVector.y / previousLength + nextVector.y / nextLength,
      };

      const directionLength = Math.hypot(direction.x, direction.y);

      return {
        id: point.id,
        point,
        angle,
        direction:
          directionLength === 0
            ? { x: 0, y: -1 }
            : {
                x: direction.x / directionLength,
                y: direction.y / directionLength,
              },
      };
    })
    .filter((angle) => angle !== null);

  return (
    <Group
      key={piece.id}
      x={piece.x}
      y={piece.y}
      draggable={activeTool === "select" && isSelected}
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
        onSelectPiece(piece.id);
      }}
      onDragMove={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }

        onUpdatePiecePosition(piece.id, event.target.x(), event.target.y());
      }}
      onDragEnd={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }

        const x = snapToGrid(event.target.x());
        const y = snapToGrid(event.target.y());

        onUpdatePiecePosition(piece.id, x, y);
        event.target.position({ x, y });
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

      {isSelected &&
        edges.map((edge) => {
          function getPointOnEdge(
            event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
          ): PointPosition | null {
            if (edge.isBezier) {
              return null;
            }

            const pointer = event.target.getStage()?.getPointerPosition();

            if (!pointer) {
              return null;
            }

            const localPointer = screenToPiecePoint(piece, pointer);
            return getClosestPointOnSegment(localPointer, edge.start, edge.end);
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

            if (edge.isBezier) {
              return;
            }

            if (
              edgePointerButton.current !== null &&
              edgePointerButton.current !== 0
            ) {
              return;
            }

            if (edgeDragMoved.current) {
              edgeDragMoved.current = false;
              return;
            }

            if ("detail" in event.evt && event.evt.detail > 1) {
              return;
            }

            const newPoint =
              hoverPoint?.edgeId === edge.id
                ? hoverPoint.point
                : getPointOnEdge(event);

            if (!newPoint || isNearEdgeEndpoint(newPoint)) {
              return;
            }

            if (clickTimer.current) {
              clearTimeout(clickTimer.current);
            }

            clickTimer.current = setTimeout(() => {
              onInsertPatternPoint(piece.id, edge.start.id, newPoint);
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

            if ("altKey" in event.evt && event.evt.altKey && !edge.isBezier) {
              const newPoint = getPointOnEdge(event);

              if (!newPoint || isNearEdgeEndpoint(newPoint)) {
                return;
              }

              onInsertPatternPoint(piece.id, edge.start.id, newPoint);
              return;
            }

            onFocusPatternPoints(piece.id, [edge.start.id, edge.end.id]);
          }

          function handleEdgeHover(
            event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
          ) {
            if (edge.isBezier) {
              setHoverPoint(null);
              return;
            }

            const newPoint = getPointOnEdge(event);

            if (!newPoint || isNearEdgeEndpoint(newPoint)) {
              setHoverPoint((currentPoint) =>
                currentPoint?.edgeId === edge.id ? null : currentPoint,
              );
              return;
            }

            setHoverPoint({ edgeId: edge.id, point: newPoint });
          }

          function handleEdgeDragMove(
            event: Konva.KonvaEventObject<DragEvent>,
          ) {
            event.cancelBubble = true;

            const position = event.target.position();
            const deltaX = snapToGrid(position.x);
            const deltaY = snapToGrid(position.y);

            if (deltaX === 0 && deltaY === 0) {
              return;
            }

            edgeDragMoved.current = true;
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
            edgePointerButton.current = null;
            event.target.position({ x: 0, y: 0 });
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
              draggable={activeTool === "select"}
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
                edgeDragMoved.current = false;
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

      {isSelected && hoverPoint && (
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

      {isSelected &&
        edges.map((edge) => {
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

      {isSelected &&
        angles.map((corner) => {
          const labelText = `${Math.round(corner.angle)}°`;
          const labelWidth = 42 / (MM_TO_PX * camera.scale);
          const labelHeight = 18 / (MM_TO_PX * camera.scale);
          const labelOffset = 24 / (MM_TO_PX * camera.scale);

          return (
            <Group
              key={`angle-${corner.id}`}
              x={corner.point.x + corner.direction.x * labelOffset}
              y={corner.point.y + corner.direction.y * labelOffset}
              listening={false}
            >
              <Rect
                x={-labelWidth / 2}
                y={-labelHeight / 2}
                width={labelWidth}
                height={labelHeight}
                fill="rgba(255, 255, 255, 0.94)"
                stroke="#f59e0b"
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
                fill="#b45309"
              />
            </Group>
          );
        })}

      {isSelected &&
        piece.points.map((point) => (
          <Circle
            key={point.id}
            x={point.x}
            y={point.y}
            radius={4 / camera.scale}
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth={1 / camera.scale}
            draggable={activeTool === "select"}
            onMouseDown={(event) => {
              event.cancelBubble = true;
            }}
            onTouchStart={(event) => {
              event.cancelBubble = true;
            }}
            onDblClick={(event) => {
              event.cancelBubble = true;
              onFocusPatternPoint(piece.id, point.id);
            }}
            onDblTap={(event) => {
              event.cancelBubble = true;
              onFocusPatternPoint(piece.id, point.id);
            }}
            onDragMove={(event) => {
              event.cancelBubble = true;

              const position = event.target.position();
              const x = snapToGrid(position.x);
              const y = snapToGrid(position.y);

              onUpdatePatternPoint(piece.id, point.id, x, y);
              event.target.position({ x, y });
            }}
            onDragEnd={(event) => {
              event.cancelBubble = true;

              const position = event.target.position();
              const x = snapToGrid(position.x);
              const y = snapToGrid(position.y);

              onUpdatePatternPoint(piece.id, point.id, x, y);
              event.target.position({ x, y });
            }}
          />
        ))}

      {isSelected &&
        piece.points.map((point) => {
          if (
            !focusedPointIds.includes(point.id) ||
            !point.curveIn ||
            !point.curveOut
          ) {
            return null;
          }

          return (
            <Group key={`curve-handles-${point.id}`}>
              <Line
                points={[
                  point.curveIn.x,
                  point.curveIn.y,
                  point.x,
                  point.y,
                  point.curveOut.x,
                  point.curveOut.y,
                ]}
                stroke="#059669"
                strokeWidth={1 / camera.scale}
                dash={[5 / camera.scale, 5 / camera.scale]}
                listening={false}
              />

              <Circle
                x={point.curveIn.x}
                y={point.curveIn.y}
                radius={4 / camera.scale}
                fill="#ffffff"
                stroke="#059669"
                strokeWidth={1.25 / camera.scale}
                draggable
                onMouseDown={(event) => {
                  event.cancelBubble = true;
                }}
                onTouchStart={(event) => {
                  event.cancelBubble = true;
                }}
                onDragMove={(event) => {
                  event.cancelBubble = true;
                  onUpdateCurveHandle(
                    piece.id,
                    point.id,
                    "curveIn",
                    event.target.position(),
                  );
                }}
                onDragEnd={(event) => {
                  event.cancelBubble = true;
                  onUpdateCurveHandle(
                    piece.id,
                    point.id,
                    "curveIn",
                    event.target.position(),
                  );
                }}
              />

              <Circle
                x={point.curveOut.x}
                y={point.curveOut.y}
                radius={4 / camera.scale}
                fill="#ffffff"
                stroke="#059669"
                strokeWidth={1.25 / camera.scale}
                draggable
                onMouseDown={(event) => {
                  event.cancelBubble = true;
                }}
                onTouchStart={(event) => {
                  event.cancelBubble = true;
                }}
                onDragMove={(event) => {
                  event.cancelBubble = true;
                  onUpdateCurveHandle(
                    piece.id,
                    point.id,
                    "curveOut",
                    event.target.position(),
                  );
                }}
                onDragEnd={(event) => {
                  event.cancelBubble = true;
                  onUpdateCurveHandle(
                    piece.id,
                    point.id,
                    "curveOut",
                    event.target.position(),
                  );
                }}
              />

              <Circle
                x={point.x}
                y={point.y}
                radius={6 / camera.scale}
                fill="#ecfdf5"
                stroke="#059669"
                strokeWidth={1.5 / camera.scale}
                listening={false}
              />
            </Group>
          );
        })}

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

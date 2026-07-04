import type Konva from "konva";
import { Circle, Group, Line, Rect, Shape, Text } from "react-konva";

import {
  drawPatternOutline,
  getClosestPointOnSegment,
  getLineLength,
  getPointAngle,
  getReadableLineRotation,
  snapToGrid,
} from "../lib/geometry";
import { MM_TO_PX } from "../lib/patternConfig";
import type { Camera, PatternPiece, PointPosition, Tool } from "../types";

type PatternPieceNodeProps = {
  activeTool: Tool;
  camera: Camera;
  isSelected: boolean;
  piece: PatternPiece;
  screenToPiecePoint: (
    piece: PatternPiece,
    screenPoint: PointPosition,
  ) => PointPosition;
  onDeletePatternPoint: (pieceId: string, pointId: string) => void;
  onInsertPatternPoint: (
    pieceId: string,
    afterPointId: string,
    point: PointPosition,
  ) => void;
  onSelectPiece: (pieceId: string) => void;
  onUpdatePatternPoint: (
    pieceId: string,
    pointId: string,
    x: number,
    y: number,
  ) => void;
  onUpdatePiecePosition: (pieceId: string, x: number, y: number) => void;
};

export function PatternPieceNode({
  activeTool,
  camera,
  isSelected,
  piece,
  screenToPiecePoint,
  onDeletePatternPoint,
  onInsertPatternPoint,
  onSelectPiece,
  onUpdatePatternPoint,
  onUpdatePiecePosition,
}: PatternPieceNodeProps) {
  const edges = piece.points
    .map((start, index) => {
      const end = piece.points[(index + 1) % piece.points.length];
      const length = getLineLength(start, end);

      if (length === 0) {
        return null;
      }

      const dx = end.x - start.x;
      const dy = end.y - start.y;

      return {
        id: `${start.id}-${end.id}`,
        start,
        end,
        length,
        midpoint: {
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2,
        },
        normal: {
          x: -dy / length,
          y: dx / length,
        },
        rotation: getReadableLineRotation(start, end),
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

      const previousVector = {
        x: previous.x - point.x,
        y: previous.y - point.y,
      };

      const nextVector = {
        x: next.x - point.x,
        y: next.y - point.y,
      };

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
          isSelected
            ? "rgba(220, 235, 255, 0.9)"
            : "rgba(255, 255, 255, 0.85)"
        }
        stroke={isSelected ? "#2563eb" : "#171717"}
        strokeWidth={(isSelected ? 1.5 : 1) / camera.scale}
      />

      {isSelected &&
        edges.map((edge) => {
          function handleInsertPoint(
            event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
          ) {
            event.cancelBubble = true;

            const pointer = event.target.getStage()?.getPointerPosition();

            if (!pointer) {
              return;
            }

            const localPointer = screenToPiecePoint(piece, pointer);
            const newPoint = getClosestPointOnSegment(
              localPointer,
              edge.start,
              edge.end,
            );

            if (
              getLineLength(newPoint, edge.start) < 1 ||
              getLineLength(newPoint, edge.end) < 1
            ) {
              return;
            }

            onInsertPatternPoint(piece.id, edge.start.id, newPoint);
          }

          return (
            <Line
              key={`insert-hit-${edge.id}`}
              points={[edge.start.x, edge.start.y, edge.end.x, edge.end.y]}
              stroke="rgba(37, 99, 235, 0.01)"
              strokeWidth={10 / camera.scale}
              hitStrokeWidth={14 / camera.scale}
              onDblClick={handleInsertPoint}
              onDblTap={handleInsertPoint}
            />
          );
        })}

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
              onDeletePatternPoint(piece.id, point.id);
            }}
            onDblTap={(event) => {
              event.cancelBubble = true;
              onDeletePatternPoint(piece.id, point.id);
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

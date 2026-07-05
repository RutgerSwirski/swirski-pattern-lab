import type Konva from "konva";
import { Circle, Group, Line, Rect, Shape, Text } from "react-konva";

import {
  drawPatternOutline,
  getPointAngle,
  getPointAngleVectors,
  snapToGrid,
} from "../lib/geometry";
import { MM_TO_PX } from "../lib/patternConfig";
import type {
  Camera,
  CurveHandle,
  FocusedCurveHandle,
  PatternPiece,
  PatternPoint,
  PieceTool,
  PointPosition,
  Tool,
} from "../types";
import { PatternPieceEdges } from "./PatternPieceEdges";

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
}: PatternPieceNodeProps) {
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

  function commitHistoryTransactionAfterDragEnd() {
    onCommitHistoryTransaction();
  }

  function commitHistoryTransactionOnPointerRelease() {
    const commit = () => {
      onCommitHistoryTransaction();
    };

    window.addEventListener("mouseup", commit, { once: true });
    window.addEventListener("touchend", commit, { once: true });
  }

  const canMoveGeometry =
    activeTool === "select" && isSelected && pieceTool === "move";
  const canEditCurves =
    activeTool === "select" && isSelected && pieceTool === "curve";
  const focusedHandleKeys = new Set(
    focusedCurveHandles.map(
      (focusedHandle) =>
        `${focusedHandle.pointId}:${focusedHandle.handle}` as const,
    ),
  );

  function hasFocusedHandle(pointId: string, handle: CurveHandle) {
    return focusedHandleKeys.has(`${pointId}:${handle}`);
  }

  function renderCurveHandle(
    point: PatternPoint,
    handle: CurveHandle,
    position: PointPosition,
  ) {
    return (
      <Circle
        key={`${point.id}-${handle}`}
        x={position.x}
        y={position.y}
        radius={4 / camera.scale}
        fill="#ffffff"
        stroke="#059669"
        strokeWidth={1.25 / camera.scale}
        draggable={canEditCurves}
        onMouseDown={(event) => {
          event.cancelBubble = true;

          if (canEditCurves) {
            onBeginHistoryTransaction();
            commitHistoryTransactionOnPointerRelease();
          }
        }}
        onTouchStart={(event) => {
          event.cancelBubble = true;

          if (canEditCurves) {
            onBeginHistoryTransaction();
            commitHistoryTransactionOnPointerRelease();
          }
        }}
        onMouseUp={(event) => {
          event.cancelBubble = true;

          if (canEditCurves) {
            commitHistoryTransactionAfterDragEnd();
          }
        }}
        onTouchEnd={(event) => {
          event.cancelBubble = true;

          if (canEditCurves) {
            commitHistoryTransactionAfterDragEnd();
          }
        }}
        onDragStart={(event) => {
          event.cancelBubble = true;
          onBeginHistoryTransaction();
        }}
        onDragMove={(event) => {
          event.cancelBubble = true;
          onUpdateCurveHandle(piece.id, point.id, handle, event.target.position());
        }}
        onDragEnd={(event) => {
          event.cancelBubble = true;
          onCommitHistoryTransaction();
        }}
      />
    );
  }

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

      {isSelected && (
        <PatternPieceEdges
          activeTool={activeTool}
          camera={camera}
          pieceTool={pieceTool}
          piece={piece}
          screenToPiecePoint={screenToPiecePoint}
          onBeginHistoryTransaction={onBeginHistoryTransaction}
          onCommitHistoryTransaction={onCommitHistoryTransaction}
          onFocusPatternSegment={onFocusPatternSegment}
          onInsertPatternPoint={onInsertPatternPoint}
          onOpenBezierContextMenu={onOpenBezierContextMenu}
          onSelectPieceTool={onSelectPieceTool}
          onTranslatePatternSegment={onTranslatePatternSegment}
        />
      )}

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
            draggable={canMoveGeometry}
            onMouseDown={(event) => {
              event.cancelBubble = true;

              if (canMoveGeometry) {
                onBeginHistoryTransaction();
                commitHistoryTransactionOnPointerRelease();
              }
            }}
            onTouchStart={(event) => {
              event.cancelBubble = true;

              if (canMoveGeometry) {
                onBeginHistoryTransaction();
                commitHistoryTransactionOnPointerRelease();
              }
            }}
            onMouseUp={(event) => {
              event.cancelBubble = true;

              if (canMoveGeometry) {
                commitHistoryTransactionAfterDragEnd();
              }
            }}
            onTouchEnd={(event) => {
              event.cancelBubble = true;

              if (canMoveGeometry) {
                commitHistoryTransactionAfterDragEnd();
              }
            }}
            onDblClick={(event) => {
              event.cancelBubble = true;
              onSelectPieceTool("curve");
              onFocusPatternPoint(piece.id, point.id);
            }}
            onDblTap={(event) => {
              event.cancelBubble = true;
              onSelectPieceTool("curve");
              onFocusPatternPoint(piece.id, point.id);
            }}
            onClick={(event) => {
              event.cancelBubble = true;

              if (pieceTool === "curve") {
                onFocusPatternPoint(piece.id, point.id);
              }
            }}
            onTap={(event) => {
              event.cancelBubble = true;

              if (pieceTool === "curve") {
                onFocusPatternPoint(piece.id, point.id);
              }
            }}
            onDragStart={(event) => {
              event.cancelBubble = true;
              onBeginHistoryTransaction();
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

              event.target.position({ x, y });
              onCommitHistoryTransaction();
            }}
          />
        ))}

      {isSelected &&
        pieceTool === "curve" &&
        piece.points.map((point) => {
          const showCurveIn = Boolean(
            point.curveIn && hasFocusedHandle(point.id, "curveIn"),
          );
          const showCurveOut = Boolean(
            point.curveOut && hasFocusedHandle(point.id, "curveOut"),
          );

          if (!showCurveIn && !showCurveOut) {
            return null;
          }

          return (
            <Group key={`curve-handles-${point.id}`}>
              {showCurveIn && point.curveIn && (
                <>
                  <Line
                    points={[point.curveIn.x, point.curveIn.y, point.x, point.y]}
                    stroke="#059669"
                    strokeWidth={1 / camera.scale}
                    dash={[5 / camera.scale, 5 / camera.scale]}
                    listening={false}
                  />

                  {renderCurveHandle(point, "curveIn", point.curveIn)}
                </>
              )}

              {showCurveOut && point.curveOut && (
                <>
                  <Line
                    points={[
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

                  {renderCurveHandle(point, "curveOut", point.curveOut)}
                </>
              )}

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

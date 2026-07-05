import { useState } from "react";
import { Circle, Group, Line } from "react-konva";

import type {
  Camera,
  CurveHandle,
  FocusedCurveHandle,
  PatternPiece,
  PatternPoint,
  PointPosition,
} from "../types";

type PatternCurveHandlesProps = {
  camera: Camera;
  canEditCurves: boolean;
  focusedCurveHandles: FocusedCurveHandle[];
  piece: PatternPiece;
  onBeginHistoryTransaction: () => void;
  onCommitHistoryTransaction: () => void;
  onUpdateCurveHandle: (
    pieceId: string,
    pointId: string,
    handle: CurveHandle,
    position: PointPosition,
  ) => void;
};

export function PatternCurveHandles({
  camera,
  canEditCurves,
  focusedCurveHandles,
  piece,
  onBeginHistoryTransaction,
  onCommitHistoryTransaction,
  onUpdateCurveHandle,
}: PatternCurveHandlesProps) {
  const [hoveredHandleKey, setHoveredHandleKey] = useState<string | null>(null);
  const focusedHandleKeys = new Set(
    focusedCurveHandles.map(
      (focusedHandle) =>
        `${focusedHandle.pointId}:${focusedHandle.handle}` as const,
    ),
  );

  function hasFocusedHandle(pointId: string, handle: CurveHandle) {
    return focusedHandleKeys.has(`${pointId}:${handle}`);
  }

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

  function renderCurveHandle(
    point: PatternPoint,
    handle: CurveHandle,
    position: PointPosition,
  ) {
    const handleKey = `${point.id}-${handle}`;
    const isHovered = hoveredHandleKey === handleKey;

    return (
      <Circle
        key={handleKey}
        x={position.x}
        y={position.y}
        radius={(isHovered ? 6 : 4) / camera.scale}
        fill={isHovered ? "#d1fae5" : "#ffffff"}
        stroke={isHovered ? "#047857" : "#059669"}
        strokeWidth={(isHovered ? 1.8 : 1.25) / camera.scale}
        shadowColor={isHovered ? "#059669" : undefined}
        shadowBlur={isHovered ? 9 / camera.scale : 0}
        shadowOpacity={isHovered ? 0.28 : 0}
        draggable={canEditCurves}
        onMouseEnter={() => {
          setHoveredHandleKey(handleKey);
        }}
        onMouseLeave={() => {
          setHoveredHandleKey((currentHandleKey) =>
            currentHandleKey === handleKey ? null : currentHandleKey,
          );
        }}
        onMouseDown={(event) => {
          event.cancelBubble = true;

          if (canEditCurves) {
            onBeginHistoryTransaction();
            commitHistoryTransactionOnPointerRelease();
          }
        }}
        onTouchStart={(event) => {
          event.cancelBubble = true;
          setHoveredHandleKey(handleKey);

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
          setHoveredHandleKey(null);

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
          onUpdateCurveHandle(
            piece.id,
            point.id,
            handle,
            event.target.position(),
          );
        }}
        onDragEnd={(event) => {
          event.cancelBubble = true;
          setHoveredHandleKey(null);
          onCommitHistoryTransaction();
        }}
      />
    );
  }

  return (
    <>
      {piece.points.map((point) => {
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
                  points={[point.x, point.y, point.curveOut.x, point.curveOut.y]}
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
    </>
  );
}

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
          onUpdateCurveHandle(
            piece.id,
            point.id,
            handle,
            event.target.position(),
          );
        }}
        onDragEnd={(event) => {
          event.cancelBubble = true;
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

import { useState } from "react";
import { Circle } from "react-konva";

import { snapToGrid } from "../lib/geometry";
import type { Camera, PatternPiece, PieceTool } from "../types";

type PatternPointNodesProps = {
  camera: Camera;
  canMoveGeometry: boolean;
  piece: PatternPiece;
  pieceTool: PieceTool;
  onBeginHistoryTransaction: () => void;
  onCommitHistoryTransaction: () => void;
  onFocusPatternPoint: (pieceId: string, pointId: string) => void;
  onSelectPieceTool: (tool: PieceTool) => void;
  onUpdatePatternPoint: (
    pieceId: string,
    pointId: string,
    x: number,
    y: number,
  ) => void;
};

export function PatternPointNodes({
  camera,
  canMoveGeometry,
  piece,
  pieceTool,
  onBeginHistoryTransaction,
  onCommitHistoryTransaction,
  onFocusPatternPoint,
  onSelectPieceTool,
  onUpdatePatternPoint,
}: PatternPointNodesProps) {
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);

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

  return (
    <>
      {piece.points.map((point) => {
        const isHovered = hoveredPointId === point.id;

        return (
          <Circle
            key={point.id}
            x={point.x}
            y={point.y}
            radius={(isHovered ? 7 : 4) / camera.scale}
            fill={isHovered ? "#dbeafe" : "#ffffff"}
            stroke={isHovered ? "#1d4ed8" : "#2563eb"}
            strokeWidth={(isHovered ? 1.8 : 1) / camera.scale}
            shadowColor={isHovered ? "#2563eb" : undefined}
            shadowBlur={isHovered ? 10 / camera.scale : 0}
            shadowOpacity={isHovered ? 0.25 : 0}
            draggable={canMoveGeometry}
            onMouseEnter={() => {
              setHoveredPointId(point.id);
            }}
            onMouseLeave={() => {
              setHoveredPointId((currentPointId) =>
                currentPointId === point.id ? null : currentPointId,
              );
            }}
            onMouseDown={(event) => {
              event.cancelBubble = true;

              if (canMoveGeometry) {
                onBeginHistoryTransaction();
                commitHistoryTransactionOnPointerRelease();
              }
            }}
            onTouchStart={(event) => {
              event.cancelBubble = true;
              setHoveredPointId(point.id);

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
              setHoveredPointId(null);

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
              setHoveredPointId(null);
              onCommitHistoryTransaction();
            }}
          />
        );
      })}
    </>
  );
}

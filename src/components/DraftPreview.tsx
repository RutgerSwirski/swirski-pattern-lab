import { Circle, Line } from "react-konva";

import type { Camera, PatternPoint, PointPosition } from "../types";

type DraftPreviewProps = {
  camera: Camera;
  draftCursor: PointPosition | null;
  draftPoints: PatternPoint[];
};

export function DraftPreview({
  camera,
  draftCursor,
  draftPoints,
}: DraftPreviewProps) {
  return (
    <>
      {draftPoints.length > 0 && (
        <Line
          points={draftPoints.flatMap((point) => [point.x, point.y])}
          stroke="#555555"
          strokeWidth={1 / camera.scale}
          dash={[6 / camera.scale, 6 / camera.scale]}
          listening={false}
        />
      )}

      {draftPoints.length > 0 && draftCursor && (
        <Line
          points={[
            draftPoints[draftPoints.length - 1].x,
            draftPoints[draftPoints.length - 1].y,
            draftCursor.x,
            draftCursor.y,
          ]}
          stroke="#777777"
          strokeWidth={1 / camera.scale}
          dash={[4 / camera.scale, 4 / camera.scale]}
          listening={false}
        />
      )}

      {draftPoints.map((point) => (
        <Circle
          key={point.id}
          x={point.x}
          y={point.y}
          radius={4 / camera.scale}
          fill="#171717"
        />
      ))}
    </>
  );
}

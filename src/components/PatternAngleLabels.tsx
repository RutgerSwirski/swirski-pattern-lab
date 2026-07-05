import { Group, Rect, Text } from "react-konva";

import { getPointAngle, getPointAngleVectors } from "../lib/geometry";
import { MM_TO_PX } from "../lib/patternConfig";
import type { Camera, PatternPiece } from "../types";

type PatternAngleLabelsProps = {
  camera: Camera;
  piece: PatternPiece;
};

export function PatternAngleLabels({ camera, piece }: PatternAngleLabelsProps) {
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
    <>
      {angles.map((corner) => {
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
    </>
  );
}

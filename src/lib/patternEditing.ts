import type { PatternPoint } from "../types";

export function clearBezierSegmentHandles(
  points: PatternPoint[],
  startPointId: string,
) {
  const startIndex = points.findIndex((point) => point.id === startPointId);

  if (startIndex === -1) {
    return points;
  }

  const endIndex = (startIndex + 1) % points.length;

  return points.map((point, index) => {
    if (index === startIndex) {
      return {
        ...point,
        curveOut: undefined,
      };
    }

    if (index === endIndex) {
      return {
        ...point,
        curveIn: undefined,
      };
    }

    return point;
  });
}

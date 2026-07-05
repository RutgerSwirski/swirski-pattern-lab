import type Konva from "konva";

import type { PatternPoint, PointPosition } from "../types";
import { GRID_SIZE_MM } from "./patternConfig";

export function snapToGrid(value: number) {
  return Math.round(value / GRID_SIZE_MM) * GRID_SIZE_MM;
}

export function getGridSnappedTranslation(
  startPoint: PointPosition,
  rawOffset: PointPosition,
  currentSnappedOffset: PointPosition,
) {
  const snappedOffset = {
    x: snapToGrid(startPoint.x + rawOffset.x) - startPoint.x,
    y: snapToGrid(startPoint.y + rawOffset.y) - startPoint.y,
  };

  return {
    delta: {
      x: snappedOffset.x - currentSnappedOffset.x,
      y: snappedOffset.y - currentSnappedOffset.y,
    },
    offset: snappedOffset,
  };
}

export function getNumericInputValue(value: string, minimum: number) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? Math.max(minimum, numberValue) : minimum;
}

export function getLineLength(start: PointPosition, end: PointPosition) {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

export function mirrorPointPosition(
  point: PointPosition,
  axisX: number,
): PointPosition {
  return {
    x: axisX * 2 - point.x,
    y: point.y,
  };
}

export function mirrorPatternPoint(
  point: PatternPoint,
  axisX: number,
): PatternPoint {
  return {
    ...point,
    ...mirrorPointPosition(point, axisX),
    curveIn: point.curveIn
      ? mirrorPointPosition(point.curveIn, axisX)
      : undefined,
    curveOut: point.curveOut
      ? mirrorPointPosition(point.curveOut, axisX)
      : undefined,
  };
}

export function getCubicPoint(
  start: PointPosition,
  controlA: PointPosition,
  controlB: PointPosition,
  end: PointPosition,
  progress: number,
) {
  const inverseProgress = 1 - progress;
  const startFactor = inverseProgress ** 3;
  const controlAFactor = 3 * inverseProgress ** 2 * progress;
  const controlBFactor = 3 * inverseProgress * progress ** 2;
  const endFactor = progress ** 3;

  return {
    x:
      start.x * startFactor +
      controlA.x * controlAFactor +
      controlB.x * controlBFactor +
      end.x * endFactor,
    y:
      start.y * startFactor +
      controlA.y * controlAFactor +
      controlB.y * controlBFactor +
      end.y * endFactor,
  };
}

export function getCubicTangent(
  start: PointPosition,
  controlA: PointPosition,
  controlB: PointPosition,
  end: PointPosition,
  progress: number,
) {
  const inverseProgress = 1 - progress;

  return {
    x:
      3 * inverseProgress ** 2 * (controlA.x - start.x) +
      6 * inverseProgress * progress * (controlB.x - controlA.x) +
      3 * progress ** 2 * (end.x - controlB.x),
    y:
      3 * inverseProgress ** 2 * (controlA.y - start.y) +
      6 * inverseProgress * progress * (controlB.y - controlA.y) +
      3 * progress ** 2 * (end.y - controlB.y),
  };
}

export function getSplitCubicBezier(
  start: PointPosition,
  controlA: PointPosition,
  controlB: PointPosition,
  end: PointPosition,
  progress: number,
) {
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const startControl = getInterpolatedPoint(start, controlA, clampedProgress);
  const centerControl = getInterpolatedPoint(controlA, controlB, clampedProgress);
  const endControl = getInterpolatedPoint(controlB, end, clampedProgress);
  const firstInnerControl = getInterpolatedPoint(
    startControl,
    centerControl,
    clampedProgress,
  );
  const secondInnerControl = getInterpolatedPoint(
    centerControl,
    endControl,
    clampedProgress,
  );
  const splitPoint = getInterpolatedPoint(
    firstInnerControl,
    secondInnerControl,
    clampedProgress,
  );

  return {
    first: {
      start,
      controlA: startControl,
      controlB: firstInnerControl,
      end: splitPoint,
    },
    second: {
      start: splitPoint,
      controlA: secondInnerControl,
      controlB: endControl,
      end,
    },
    point: splitPoint,
  };
}

export function getSegmentLabelGeometry(start: PatternPoint, end: PatternPoint) {
  const controlA = start.curveOut ?? start;
  const controlB = end.curveIn ?? end;
  const midpoint = getCubicPoint(start, controlA, controlB, end, 0.5);
  const tangent = getCubicTangent(start, controlA, controlB, end, 0.5);
  const tangentLength = getLineLength({ x: 0, y: 0 }, tangent);
  const fallbackLength = getLineLength(start, end);

  if (tangentLength === 0 && fallbackLength === 0) {
    return null;
  }

  const direction =
    tangentLength === 0
      ? {
          x: (end.x - start.x) / fallbackLength,
          y: (end.y - start.y) / fallbackLength,
        }
      : {
          x: tangent.x / tangentLength,
          y: tangent.y / tangentLength,
        };

  return {
    midpoint,
    normal: {
      x: -direction.y,
      y: direction.x,
    },
    rotation: getReadablePointRotation(direction),
  };
}

export function getSegmentLength(start: PatternPoint, end: PatternPoint) {
  const controlA = start.curveOut ?? start;
  const controlB = end.curveIn ?? end;

  if (controlA === start && controlB === end) {
    return getLineLength(start, end);
  }

  const sampleCount = 24;
  let length = 0;
  let previousPoint: PointPosition = start;

  for (let index = 1; index <= sampleCount; index += 1) {
    const point = getCubicPoint(
      start,
      controlA,
      controlB,
      end,
      index / sampleCount,
    );

    length += getLineLength(previousPoint, point);
    previousPoint = point;
  }

  return length;
}

export function getSegmentSplitLengths(
  start: PatternPoint,
  end: PatternPoint,
  progress: number,
) {
  const controlA = start.curveOut ?? start;
  const controlB = end.curveIn ?? end;

  if (controlA === start && controlB === end) {
    const length = getLineLength(start, end);
    const clampedProgress = Math.min(1, Math.max(0, progress));

    return {
      first: length * clampedProgress,
      second: length * (1 - clampedProgress),
    };
  }

  const split = getSplitCubicBezier(start, controlA, controlB, end, progress);
  const splitPoint = {
    id: "split-preview",
    ...split.point,
    curveIn: split.first.controlB,
    curveOut: split.second.controlA,
  };

  return {
    first: getSegmentLength(
      {
        ...start,
        curveOut: split.first.controlA,
      },
      splitPoint,
    ),
    second: getSegmentLength(splitPoint, {
      ...end,
      curveIn: split.second.controlB,
    }),
  };
}

export function getClosestPointOnSegment(
  point: PointPosition,
  start: PointPosition,
  end: PointPosition,
) {
  return getClosestPointOnSegmentWithProgress(point, start, end).point;
}

export function getClosestPointOnSegmentWithProgress(
  point: PointPosition,
  start: PointPosition,
  end: PointPosition,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return {
      point: start,
      progress: 0,
    };
  }

  const progress = Math.min(
    1,
    Math.max(
      0,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );

  return {
    point: {
      x: start.x + dx * progress,
      y: start.y + dy * progress,
    },
    progress,
  };
}

export function getClosestPointOnCubic(
  point: PointPosition,
  start: PointPosition,
  controlA: PointPosition,
  controlB: PointPosition,
  end: PointPosition,
) {
  const sampleCount = 80;
  let bestProgress = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index <= sampleCount; index += 1) {
    const progress = index / sampleCount;
    const sample = getCubicPoint(start, controlA, controlB, end, progress);
    const distance = getSquaredDistance(point, sample);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestProgress = progress;
    }
  }

  let lower = Math.max(0, bestProgress - 1 / sampleCount);
  let upper = Math.min(1, bestProgress + 1 / sampleCount);

  for (let index = 0; index < 12; index += 1) {
    const leftProgress = lower + (upper - lower) / 3;
    const rightProgress = upper - (upper - lower) / 3;
    const leftPoint = getCubicPoint(
      start,
      controlA,
      controlB,
      end,
      leftProgress,
    );
    const rightPoint = getCubicPoint(
      start,
      controlA,
      controlB,
      end,
      rightProgress,
    );

    if (
      getSquaredDistance(point, leftPoint) <
      getSquaredDistance(point, rightPoint)
    ) {
      upper = rightProgress;
    } else {
      lower = leftProgress;
    }
  }

  const progress = (lower + upper) / 2;

  return {
    point: getCubicPoint(start, controlA, controlB, end, progress),
    progress,
  };
}

export function getClosestPointOnPatternSegment(
  point: PointPosition,
  start: PatternPoint,
  end: PatternPoint,
) {
  const controlA = start.curveOut ?? start;
  const controlB = end.curveIn ?? end;

  if (controlA === start && controlB === end) {
    return getClosestPointOnSegmentWithProgress(point, start, end);
  }

  return getClosestPointOnCubic(point, start, controlA, controlB, end);
}

export function getPiecePerimeter(points: PatternPoint[]) {
  return points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];

    return total + getSegmentLength(point, next);
  }, 0);
}

export function drawPatternOutline(
  context: Konva.Context,
  shape: Konva.Shape,
  points: PatternPoint[],
  cornerRadiusMm: number,
) {
  if (points.length === 0) {
    return;
  }

  const hasBezierHandles = points.some(
    (point) => point.curveIn || point.curveOut,
  );

  if (hasBezierHandles) {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);

    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length];
      const outHandle = point.curveOut ?? point;
      const inHandle = next.curveIn ?? next;

      if (outHandle === point && inHandle === next) {
        context.lineTo(next.x, next.y);
        return;
      }

      context.bezierCurveTo(
        outHandle.x,
        outHandle.y,
        inHandle.x,
        inHandle.y,
        next.x,
        next.y,
      );
    });

    context.closePath();
    context.fillStrokeShape(shape);
    return;
  }

  if (points.length < 3 || cornerRadiusMm <= 0) {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);

    points.slice(1).forEach((point) => {
      context.lineTo(point.x, point.y);
    });

    context.closePath();
    context.fillStrokeShape(shape);
    return;
  }

  context.beginPath();

  points.forEach((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const previousLength = getLineLength(point, previous);
    const nextLength = getLineLength(point, next);
    const radius = Math.min(
      cornerRadiusMm,
      previousLength / 2,
      nextLength / 2,
    );

    if (radius <= 0 || previousLength === 0 || nextLength === 0) {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }

      return;
    }

    const beforeCorner = {
      x: point.x + ((previous.x - point.x) / previousLength) * radius,
      y: point.y + ((previous.y - point.y) / previousLength) * radius,
    };

    const afterCorner = {
      x: point.x + ((next.x - point.x) / nextLength) * radius,
      y: point.y + ((next.y - point.y) / nextLength) * radius,
    };

    if (index === 0) {
      context.moveTo(beforeCorner.x, beforeCorner.y);
    } else {
      context.lineTo(beforeCorner.x, beforeCorner.y);
    }

    context.quadraticCurveTo(
      point.x,
      point.y,
      afterCorner.x,
      afterCorner.y,
    );
  });

  context.closePath();
  context.fillStrokeShape(shape);
}

export function getReadableLineRotation(start: PatternPoint, end: PatternPoint) {
  return getReadablePointRotation({
    x: end.x - start.x,
    y: end.y - start.y,
  });
}

function getReadablePointRotation(point: PointPosition) {
  let rotation = (Math.atan2(point.y, point.x) * 180) / Math.PI;

  if (rotation > 90 || rotation < -90) {
    rotation += 180;
  }

  return rotation;
}

function getInterpolatedPoint(
  start: PointPosition,
  end: PointPosition,
  progress: number,
) {
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  };
}

function getSquaredDistance(start: PointPosition, end: PointPosition) {
  return (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
}

export function getPointAngleVectors(
  previous: PatternPoint,
  point: PatternPoint,
  next: PatternPoint,
) {
  return {
    previousVector: {
      x: (point.curveIn?.x ?? previous.x) - point.x,
      y: (point.curveIn?.y ?? previous.y) - point.y,
    },
    nextVector: {
      x: (point.curveOut?.x ?? next.x) - point.x,
      y: (point.curveOut?.y ?? next.y) - point.y,
    },
  };
}

export function getPointAngle(
  previous: PatternPoint,
  point: PatternPoint,
  next: PatternPoint,
) {
  const { previousVector, nextVector } = getPointAngleVectors(
    previous,
    point,
    next,
  );

  const previousLength = Math.hypot(previousVector.x, previousVector.y);
  const nextLength = Math.hypot(nextVector.x, nextVector.y);

  if (previousLength === 0 || nextLength === 0) {
    return null;
  }

  const cosine =
    (previousVector.x * nextVector.x + previousVector.y * nextVector.y) /
    (previousLength * nextLength);

  return (
    (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) /
    Math.PI
  );
}

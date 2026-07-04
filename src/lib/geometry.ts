import type Konva from "konva";

import type { PatternPoint, PointPosition } from "../types";
import { GRID_SIZE_MM } from "./patternConfig";

export function snapToGrid(value: number) {
  return Math.round(value / GRID_SIZE_MM) * GRID_SIZE_MM;
}

export function getNumericInputValue(value: string, minimum: number) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? Math.max(minimum, numberValue) : minimum;
}

export function getLineLength(start: PointPosition, end: PointPosition) {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

export function getClosestPointOnSegment(
  point: PointPosition,
  start: PointPosition,
  end: PointPosition,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return start;
  }

  const progress = Math.min(
    1,
    Math.max(
      0,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );

  return {
    x: start.x + dx * progress,
    y: start.y + dy * progress,
  };
}

export function getPiecePerimeter(points: PatternPoint[]) {
  return points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];

    return total + getLineLength(point, next);
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
  let rotation = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;

  if (rotation > 90 || rotation < -90) {
    rotation += 180;
  }

  return rotation;
}

export function getPointAngle(
  previous: PatternPoint,
  point: PatternPoint,
  next: PatternPoint,
) {
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

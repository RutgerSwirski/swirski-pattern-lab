import { describe, expect, it } from "vitest";

import { getClosestPointOnSegment } from "./geometry";

function expectPointOnSegmentLine(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const crossProduct = (point.x - start.x) * dy - (point.y - start.y) * dx;

  expect(Math.abs(crossProduct)).toBeLessThan(0.000001);
}

describe("geometry", () => {
  it("projects pointer positions onto angled segments", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 5, y: 100 };
    const projectedPoint = getClosestPointOnSegment({ x: 30, y: 52 }, start, end);

    expectPointOnSegmentLine(projectedPoint, start, end);
    expect(projectedPoint.x).toBeGreaterThan(start.x);
    expect(projectedPoint.x).toBeLessThan(end.x);
    expect(projectedPoint.y).toBeGreaterThan(start.y);
    expect(projectedPoint.y).toBeLessThan(end.y);
  });

  it("clamps projected points to segment endpoints", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 0 };

    expect(getClosestPointOnSegment({ x: -20, y: 10 }, start, end)).toEqual(
      start,
    );
    expect(getClosestPointOnSegment({ x: 120, y: 10 }, start, end)).toEqual(end);
  });
});

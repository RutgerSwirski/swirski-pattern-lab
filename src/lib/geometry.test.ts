import { describe, expect, it } from "vitest";

import {
  getClosestPointOnSegment,
  getGridSnappedTranslation,
  getSegmentLength,
  getSegmentSplitLengths,
} from "./geometry";

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

  it("returns incremental deltas for grid-snapped translations", () => {
    const firstMove = getGridSnappedTranslation(
      { x: -120, y: -160 },
      { x: 4, y: 6 },
      { x: 0, y: 0 },
    );

    expect(firstMove).toEqual({
      delta: { x: 0, y: 10 },
      offset: { x: 0, y: 10 },
    });

    const secondMove = getGridSnappedTranslation(
      { x: -120, y: -160 },
      { x: 14, y: 17 },
      firstMove.offset,
    );

    expect(secondMove).toEqual({
      delta: { x: 10, y: 10 },
      offset: { x: 10, y: 20 },
    });
  });

  it("previews split segment lengths for straight edges", () => {
    expect(
      getSegmentSplitLengths(
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 100, y: 0 },
        0.35,
      ),
    ).toEqual({ first: 35, second: 65 });
  });

  it("previews split segment lengths for bezier edges", () => {
    const start = {
      id: "a",
      x: 0,
      y: 0,
      curveOut: { x: 0, y: 80 },
    };
    const end = {
      id: "b",
      x: 100,
      y: 0,
      curveIn: { x: 100, y: 80 },
    };
    const splitLengths = getSegmentSplitLengths(start, end, 0.5);

    expect(
      Math.abs(splitLengths.first + splitLengths.second - getSegmentLength(start, end)),
    ).toBeLessThan(0.2);
    expect(splitLengths.first).toBeGreaterThan(50);
    expect(splitLengths.second).toBeGreaterThan(50);
  });
});

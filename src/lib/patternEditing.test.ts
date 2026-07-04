import { describe, expect, it } from "vitest";

import { clearBezierSegmentHandles } from "./patternEditing";

describe("pattern editing", () => {
  it("clears only the handles that define a bezier segment", () => {
    const points = [
      {
        id: "a",
        x: 0,
        y: 0,
        curveIn: { x: -10, y: 0 },
        curveOut: { x: 10, y: 0 },
      },
      {
        id: "b",
        x: 100,
        y: 0,
        curveIn: { x: 90, y: 0 },
        curveOut: { x: 110, y: 0 },
      },
      {
        id: "c",
        x: 100,
        y: 100,
        curveIn: { x: 100, y: 90 },
      },
    ];

    const updatedPoints = clearBezierSegmentHandles(points, "a");

    expect(updatedPoints[0].curveIn).toEqual({ x: -10, y: 0 });
    expect(updatedPoints[0].curveOut).toBeUndefined();
    expect(updatedPoints[1].curveIn).toBeUndefined();
    expect(updatedPoints[1].curveOut).toEqual({ x: 110, y: 0 });
    expect(updatedPoints[2].curveIn).toEqual({ x: 100, y: 90 });
  });
});

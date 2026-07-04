import { describe, expect, it } from "vitest";

import type { PatternPiece, PatternPoint, PointPosition } from "../types";
import {
  createSymmetricPiecePair,
  getSymmetricLocalPosition,
} from "./symmetry";

function makePiece(overrides: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id: "source",
    name: "Source",
    lengthMm: 0,
    cornerRadiusMm: 0,
    quantity: 1,
    notes: "",
    x: 0,
    y: 0,
    points: [
      { id: "left", x: 0, y: 0 },
      {
        id: "right",
        x: 100,
        y: 0,
        curveIn: { x: 80, y: -20 },
        curveOut: { x: 120, y: 20 },
      },
      { id: "bottom", x: 60, y: 100 },
    ],
    ...overrides,
  };
}

function toWorld(piece: PatternPiece, point: PointPosition) {
  return {
    x: piece.x + point.x,
    y: piece.y + point.y,
  };
}

function getPoint(piece: PatternPiece, pointId: string) {
  return piece.points.find((point) => point.id === pointId);
}

function expectMirroredWorldPoint(
  sourcePiece: PatternPiece,
  mirroredPiece: PatternPiece,
  sourcePoint: PointPosition,
  mirroredPoint: PointPosition,
) {
  const axisX = sourcePiece.symmetry?.axisX ?? 0;
  const sourceWorld = toWorld(sourcePiece, sourcePoint);
  const mirroredWorld = toWorld(mirroredPiece, mirroredPoint);

  expect(sourceWorld.y).toBe(mirroredWorld.y);
  expect(sourceWorld.x + mirroredWorld.x).toBe(axisX * 2);
}

function expectMirroredSegmentControls(
  sourcePiece: PatternPiece,
  mirroredPiece: PatternPiece,
  sourceStart: PatternPoint,
  sourceEnd: PatternPoint,
  mirrorStart: PatternPoint,
  mirrorEnd: PatternPoint,
) {
  expectMirroredWorldPoint(sourcePiece, mirroredPiece, sourceStart, mirrorStart);
  expectMirroredWorldPoint(sourcePiece, mirroredPiece, sourceEnd, mirrorEnd);

  if (sourceStart.curveOut && mirrorStart.curveOut) {
    expectMirroredWorldPoint(
      sourcePiece,
      mirroredPiece,
      sourceStart.curveOut,
      mirrorStart.curveOut,
    );
  }

  if (sourceEnd.curveIn && mirrorEnd.curveIn) {
    expectMirroredWorldPoint(
      sourcePiece,
      mirroredPiece,
      sourceEnd.curveIn,
      mirrorEnd.curveIn,
    );
  }
}

describe("symmetry geometry", () => {
  it("mirrors off-center pieces around the gap between bounding boxes", () => {
    const { sourcePiece, mirroredPiece } = createSymmetricPiecePair(
      makePiece(),
      "mirror",
    );

    expect(sourcePiece.symmetry?.axisX).toBe(140);
    expect(mirroredPiece.x).toBe(180);

    expect(mirroredPiece.points.find((point) => point.id === "left")).toMatchObject({
      x: 100,
      y: 0,
    });

    expect(mirroredPiece.points.find((point) => point.id === "right")).toMatchObject({
      x: 0,
      y: 0,
    });
  });

  it("keeps mirrored world coordinates equidistant from the axis", () => {
    const { sourcePiece, mirroredPiece } = createSymmetricPiecePair(
      makePiece({ x: 25, y: 40 }),
      "mirror",
    );

    sourcePiece.points.forEach((sourcePoint) => {
      const mirrorPoint = getPoint(mirroredPiece, sourcePoint.id);

      expect(mirrorPoint).toBeDefined();

      if (!mirrorPoint) {
        return;
      }

      expectMirroredWorldPoint(
        sourcePiece,
        mirroredPiece,
        sourcePoint,
        mirrorPoint,
      );
    });
  });

  it("mirrors bezier handles without swapping segment attachment", () => {
    const { sourcePiece, mirroredPiece } = createSymmetricPiecePair(
      makePiece(),
      "mirror",
    );

    const sourcePoint = getPoint(sourcePiece, "right");
    const mirrorPoint = getPoint(mirroredPiece, "right");

    expect(sourcePoint?.curveOut).toEqual({ x: 120, y: 20 });
    expect(sourcePoint?.curveIn).toEqual({ x: 80, y: -20 });
    expect(mirrorPoint?.curveIn).toEqual({ x: 20, y: -20 });
    expect(mirrorPoint?.curveOut).toEqual({ x: -20, y: 20 });
  });

  it("keeps mirrored bezier segment controls attached to the same segment", () => {
    const { sourcePiece, mirroredPiece } = createSymmetricPiecePair(
      makePiece(),
      "mirror",
    );

    const sourceStart = getPoint(sourcePiece, "left");
    const sourceEnd = getPoint(sourcePiece, "right");
    const mirrorStart = getPoint(mirroredPiece, "left");
    const mirrorEnd = getPoint(mirroredPiece, "right");

    expect(sourceStart).toBeDefined();
    expect(sourceEnd).toBeDefined();
    expect(mirrorStart).toBeDefined();
    expect(mirrorEnd).toBeDefined();

    if (!sourceStart || !sourceEnd || !mirrorStart || !mirrorEnd) {
      return;
    }

    expectMirroredSegmentControls(
      sourcePiece,
      mirroredPiece,
      sourceStart,
      sourceEnd,
      mirrorStart,
      mirrorEnd,
    );
  });

  it("maps edits from the mirrored piece back to source local coordinates", () => {
    const { sourcePiece, mirroredPiece } = createSymmetricPiecePair(
      makePiece(),
      "mirror",
    );

    const mirroredEdit = { x: 90, y: 12 };
    const sourceLocal = getSymmetricLocalPosition(
      mirroredEdit,
      mirroredPiece,
      sourcePiece,
    );

    expect(sourceLocal).toEqual({ x: 10, y: 12 });
  });
});

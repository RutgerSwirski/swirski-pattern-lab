import { describe, expect, it } from "vitest";

import type { PatternPiece, PointPosition } from "../types";
import { getCubicPoint } from "./geometry";
import {
  deletePatternPieceInPieces,
  duplicatePatternPiece,
  insertPatternPointInPieces,
  translatePatternSegmentInPieces,
  updatePatternPointInPieces,
  updatePiecePositionInPieces,
} from "./patternOperations";
import { createSymmetricPiecePair } from "./symmetry";

function makePiece(overrides: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id: "piece",
    name: "Piece",
    lengthMm: 0,
    cornerRadiusMm: 0,
    quantity: 1,
    notes: "",
    x: 0,
    y: 0,
    points: [
      {
        id: "a",
        x: 0,
        y: 0,
        curveIn: { x: -10, y: 0 },
        curveOut: { x: 0, y: 60 },
      },
      {
        id: "b",
        x: 100,
        y: 100,
        curveIn: { x: 100, y: 40 },
        curveOut: { x: 130, y: 100 },
      },
      { id: "c", x: 0, y: 120 },
    ],
    ...overrides,
  };
}

function getPoint(piece: PatternPiece, pointId: string) {
  const point = piece.points.find((currentPoint) => currentPoint.id === pointId);

  if (!point) {
    throw new Error(`Missing point ${pointId}`);
  }

  return point;
}

function expectPointClose(actual: PointPosition, expected: PointPosition) {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
}

describe("pattern operations", () => {
  it("moves a point and its attached handles together", () => {
    const [updatedPiece] = updatePatternPointInPieces(
      [makePiece()],
      "piece",
      "a",
      20,
      30,
    );
    const point = getPoint(updatedPiece, "a");

    expect(point).toMatchObject({ x: 20, y: 30 });
    expect(point.curveIn).toEqual({ x: 10, y: 30 });
    expect(point.curveOut).toEqual({ x: 20, y: 90 });
  });

  it("moves both endpoints and handles for an edge drag", () => {
    const [updatedPiece] = translatePatternSegmentInPieces(
      [makePiece()],
      "piece",
      "a",
      "b",
      10,
      -20,
    );

    expect(getPoint(updatedPiece, "a")).toMatchObject({ x: 10, y: -20 });
    expect(getPoint(updatedPiece, "a").curveOut).toEqual({ x: 10, y: 40 });
    expect(getPoint(updatedPiece, "b")).toMatchObject({ x: 110, y: 80 });
    expect(getPoint(updatedPiece, "b").curveIn).toEqual({ x: 110, y: 20 });
    expect(getPoint(updatedPiece, "c")).toMatchObject({ x: 0, y: 120 });
  });

  it("inserts a point into a straight edge", () => {
    const [updatedPiece] = insertPatternPointInPieces(
      [
        makePiece({
          points: [
            { id: "a", x: 0, y: 0 },
            { id: "b", x: 100, y: 0 },
            { id: "c", x: 0, y: 100 },
          ],
        }),
      ],
      "piece",
      "a",
      { id: "inserted", x: 50, y: 0 },
    );

    expect(updatedPiece.points.map((point) => point.id)).toEqual([
      "a",
      "inserted",
      "b",
      "c",
    ]);
    expect(getPoint(updatedPiece, "inserted")).toMatchObject({ x: 50, y: 0 });
  });

  it("splits a bezier edge without changing the curve shape", () => {
    const piece = makePiece();
    const originalA = getPoint(piece, "a");
    const originalB = getPoint(piece, "b");
    const [updatedPiece] = insertPatternPointInPieces(
      [piece],
      "piece",
      "a",
      { id: "inserted", x: 0, y: 0 },
      0.5,
    );

    const updatedA = getPoint(updatedPiece, "a");
    const inserted = getPoint(updatedPiece, "inserted");
    const updatedB = getPoint(updatedPiece, "b");

    expectPointClose(
      inserted,
      getCubicPoint(
        originalA,
        originalA.curveOut ?? originalA,
        originalB.curveIn ?? originalB,
        originalB,
        0.5,
      ),
    );
    expectPointClose(
      getCubicPoint(
        updatedA,
        updatedA.curveOut ?? updatedA,
        inserted.curveIn ?? inserted,
        inserted,
        0.5,
      ),
      getCubicPoint(
        originalA,
        originalA.curveOut ?? originalA,
        originalB.curveIn ?? originalB,
        originalB,
        0.25,
      ),
    );
    expectPointClose(
      getCubicPoint(
        inserted,
        inserted.curveOut ?? inserted,
        updatedB.curveIn ?? updatedB,
        updatedB,
        0.5,
      ),
      getCubicPoint(
        originalA,
        originalA.curveOut ?? originalA,
        originalB.curveIn ?? originalB,
        originalB,
        0.75,
      ),
    );
  });

  it("mirrors inserted points into linked pieces", () => {
    const { sourcePiece, mirroredPiece } = createSymmetricPiecePair(
      makePiece({
        points: [
          { id: "a", x: 0, y: 0 },
          { id: "b", x: 100, y: 0 },
          { id: "c", x: 0, y: 100 },
        ],
      }),
      "mirror",
    );
    const [updatedSource, updatedMirror] = insertPatternPointInPieces(
      [sourcePiece, mirroredPiece],
      "piece",
      "a",
      { id: "inserted", x: 40, y: 0 },
    );

    expect(getPoint(updatedSource, "inserted")).toMatchObject({ x: 40, y: 0 });
    expect(getPoint(updatedMirror, "inserted")).toMatchObject({ x: 60, y: 0 });
  });

  it("moves only the dragged piece position for symmetric pairs", () => {
    const { sourcePiece, mirroredPiece } = createSymmetricPiecePair(
      makePiece({ x: 25, y: 10 }),
      "mirror",
    );
    const [updatedSource, updatedMirror] = updatePiecePositionInPieces(
      [sourcePiece, mirroredPiece],
      sourcePiece.id,
      80,
      40,
    );

    expect(updatedSource).toMatchObject({ x: 80, y: 40 });
    expect(updatedMirror).toMatchObject({
      x: mirroredPiece.x,
      y: mirroredPiece.y,
    });
  });

  it("duplicates pieces with new ids and without symmetry links", () => {
    const piece = makePiece({
      symmetry: {
        pairId: "mirror",
        role: "source",
        axisX: 100,
      },
      x: 10,
      y: 20,
    });
    const pointIds = ["copy-a", "copy-b", "copy-c"];
    const duplicatedPiece = duplicatePatternPiece(
      piece,
      "piece-copy",
      () => pointIds.shift() ?? "copy-extra",
      { x: 20, y: 20 },
    );

    expect(duplicatedPiece).toMatchObject({
      id: "piece-copy",
      name: "Piece Copy",
      x: 30,
      y: 40,
    });
    expect(duplicatedPiece.symmetry).toBeUndefined();
    expect(duplicatedPiece.points.map((point) => point.id)).toEqual([
      "copy-a",
      "copy-b",
      "copy-c",
    ]);
    expect(getPoint(duplicatedPiece, "copy-a").curveOut).toEqual(
      getPoint(piece, "a").curveOut,
    );
  });

  it("deletes a pattern piece", () => {
    const updatedPieces = deletePatternPieceInPieces(
      [makePiece(), makePiece({ id: "other" })],
      "piece",
    );

    expect(updatedPieces.map((piece) => piece.id)).toEqual(["other"]);
  });

  it("clears the symmetry link when deleting one piece in a symmetric pair", () => {
    const { sourcePiece, mirroredPiece } = createSymmetricPiecePair(
      makePiece(),
      "mirror",
    );
    const [remainingPiece] = deletePatternPieceInPieces(
      [sourcePiece, mirroredPiece],
      sourcePiece.id,
    );

    expect(remainingPiece.id).toBe(mirroredPiece.id);
    expect(remainingPiece.symmetry).toBeUndefined();
  });
});

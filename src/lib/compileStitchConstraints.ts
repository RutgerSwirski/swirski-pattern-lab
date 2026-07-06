import { getSegmentLength } from "./geometry";

import type {
  PatternEdgeRef,
  PatternPiece,
  PatternSeam,
  PointPosition,
} from "../types";

export type PatternEdgeSample = {
  pieceId: string;
  edge: PatternEdgeRef;
  t: number;
};

export type StitchConstraint = {
  seamId: string;
  samples: Array<{
    a: PatternEdgeSample;
    b: PatternEdgeSample;
  }>;
};

function getPointById(piece: PatternPiece, pointId: string) {
  const point = piece.points.find((candidate) => candidate.id === pointId);

  if (!point) {
    return null;
  }

  return point;
}

function edgeExists(
  piecesById: Map<string, PatternPiece>,
  edge: PatternEdgeRef,
) {
  const piece = piecesById.get(edge.pieceId);

  if (!piece) {
    return false;
  }

  return Boolean(
    getPointById(piece, edge.startPointId) &&
    getPointById(piece, edge.endPointId),
  );
}

/*
 * Returns a point along either:
 *
 * straight edge
 * cubic Bézier edge
 */
export function getPatternEdgePoint(
  piece: PatternPiece,
  edge: PatternEdgeRef,
  t: number,
): PointPosition {
  const start = getPointById(piece, edge.startPointId);
  const end = getPointById(piece, edge.endPointId);

  if (!start || !end) {
    throw new Error(`Invalid edge on piece "${piece.id}".`);
  }

  const controlA = start.curveOut ?? start;
  const controlB = end.curveIn ?? end;

  const inverseT = 1 - t;

  return {
    x:
      inverseT ** 3 * start.x +
      3 * inverseT ** 2 * t * controlA.x +
      3 * inverseT * t ** 2 * controlB.x +
      t ** 3 * end.x,

    y:
      inverseT ** 3 * start.y +
      3 * inverseT ** 2 * t * controlA.y +
      3 * inverseT * t ** 2 * controlB.y +
      t ** 3 * end.y,
  };
}

export function compileStitchConstraints(
  pieces: PatternPiece[],
  seams: PatternSeam[],
): StitchConstraint[] {
  const piecesById = new Map(pieces.map((piece) => [piece.id, piece]));

  return seams.flatMap((seam) => {
    if (
      !edgeExists(piecesById, seam.edgeA) ||
      !edgeExists(piecesById, seam.edgeB)
    ) {
      return [];
    }

    const pieceA = piecesById.get(seam.edgeA.pieceId)!;
    const pieceB = piecesById.get(seam.edgeB.pieceId)!;

    const startA = getPointById(pieceA, seam.edgeA.startPointId)!;
    const endA = getPointById(pieceA, seam.edgeA.endPointId)!;

    const startB = getPointById(pieceB, seam.edgeB.startPointId)!;
    const endB = getPointById(pieceB, seam.edgeB.endPointId)!;

    /*
     * One stitch point roughly every 20 mm.
     * Keep at least 3 points so short seams still have
     * start, middle, end.
     */
    const longestEdgeMm = Math.max(
      getSegmentLength(startA, endA),
      getSegmentLength(startB, endB),
    );

    const sampleCount = Math.max(3, Math.ceil(longestEdgeMm / 20) + 1);

    return {
      seamId: seam.id,
      samples: Array.from({ length: sampleCount }, (_, index) => {
        const t = index / (sampleCount - 1);

        return {
          a: {
            pieceId: seam.edgeA.pieceId,
            edge: seam.edgeA,
            t,
          },

          b: {
            pieceId: seam.edgeB.pieceId,
            edge: seam.edgeB,
            t: seam.reverseEdgeB ? 1 - t : t,
          },
        };
      }),
    };
  });
}

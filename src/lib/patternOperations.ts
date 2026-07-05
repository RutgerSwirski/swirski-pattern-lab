import type {
  PatternPiece,
  PatternPoint,
  PieceMetadata,
  PointPosition,
} from "../types";
import { getSplitCubicBezier } from "./geometry";
import { clearBezierSegmentHandles } from "./patternEditing";
import { getSymmetricPatternPoint } from "./symmetry";

type PiecePair = {
  editedPiece: PatternPiece;
  linkedPiece: PatternPiece | null;
};

export function getPiecePair(
  pieces: PatternPiece[],
  pieceId: string,
): PiecePair | null {
  const editedPiece = pieces.find((piece) => piece.id === pieceId);

  if (!editedPiece) {
    return null;
  }

  return {
    editedPiece,
    linkedPiece: editedPiece.symmetry
      ? (pieces.find((piece) => piece.id === editedPiece.symmetry?.pairId) ??
        null)
      : null,
  };
}

export function updatePatternPointInPieces(
  pieces: PatternPiece[],
  pieceId: string,
  pointId: string,
  x: number,
  y: number,
) {
  return updatePairedPoints(pieces, pieceId, (editedPiece) => {
    const sourcePoint = editedPiece.points.find((point) => point.id === pointId);

    if (!sourcePoint) {
      return editedPiece.points;
    }

    const deltaX = x - sourcePoint.x;
    const deltaY = y - sourcePoint.y;

    return editedPiece.points.map((point) =>
      point.id === pointId
        ? movePatternPoint(point, deltaX, deltaY, { x, y })
        : point,
    );
  });
}

export function translatePatternSegmentInPieces(
  pieces: PatternPiece[],
  pieceId: string,
  startPointId: string,
  endPointId: string,
  deltaX: number,
  deltaY: number,
) {
  if (deltaX === 0 && deltaY === 0) {
    return pieces;
  }

  const movedPointIds = new Set([startPointId, endPointId]);

  return updatePairedPoints(pieces, pieceId, (editedPiece) =>
    editedPiece.points.map((point) =>
      movedPointIds.has(point.id)
        ? movePatternPoint(point, deltaX, deltaY)
        : point,
    ),
  );
}

export function focusPatternPointsInPieces(
  pieces: PatternPiece[],
  pieceId: string,
  pointIds: string[],
) {
  return updatePairedPoints(pieces, pieceId, (editedPiece) =>
    editedPiece.points.map((point, pointIndex) => {
      if (!pointIds.includes(point.id) || (point.curveIn && point.curveOut)) {
        return point;
      }

      const previous =
        editedPiece.points[
          (pointIndex - 1 + editedPiece.points.length) % editedPiece.points.length
        ];
      const next = editedPiece.points[(pointIndex + 1) % editedPiece.points.length];

      return {
        ...point,
        curveIn: point.curveIn ?? {
          x: point.x + (previous.x - point.x) / 3,
          y: point.y + (previous.y - point.y) / 3,
        },
        curveOut: point.curveOut ?? {
          x: point.x + (next.x - point.x) / 3,
          y: point.y + (next.y - point.y) / 3,
        },
      };
    }),
  );
}

export function updateCurveHandleInPieces(
  pieces: PatternPiece[],
  pieceId: string,
  pointId: string,
  handle: "curveIn" | "curveOut",
  position: PointPosition,
) {
  return updatePairedPoints(pieces, pieceId, (editedPiece) =>
    editedPiece.points.map((point) =>
      point.id === pointId
        ? {
            ...point,
            [handle]: position,
          }
        : point,
    ),
  );
}

export function clearBezierSegmentInPieces(
  pieces: PatternPiece[],
  pieceId: string,
  startPointId: string,
) {
  return updatePairedPoints(pieces, pieceId, (editedPiece) =>
    clearBezierSegmentHandles(editedPiece.points, startPointId),
  );
}

export function insertPatternPointInPieces(
  pieces: PatternPiece[],
  pieceId: string,
  afterPointId: string,
  point: PatternPoint,
  progress?: number,
) {
  return updatePairedPoints(pieces, pieceId, (editedPiece) =>
    insertPatternPointIntoPoints(
      editedPiece.points,
      afterPointId,
      point,
      progress,
    ),
  );
}

export function deletePatternPointsInPieces(
  pieces: PatternPiece[],
  pieceId: string,
  pointIds: string[],
) {
  const pair = getPiecePair(pieces, pieceId);

  if (!pair) {
    return pieces;
  }

  const idsToDelete = new Set(pointIds);

  if (pair.editedPiece.points.length - idsToDelete.size < 3) {
    return pieces;
  }

  return updatePairedPoints(pieces, pieceId, (editedPiece) =>
    editedPiece.points.filter((point) => !idsToDelete.has(point.id)),
  );
}

export function deletePatternPieceInPieces(
  pieces: PatternPiece[],
  pieceId: string,
) {
  const deletedPiece = pieces.find((piece) => piece.id === pieceId);

  if (!deletedPiece) {
    return pieces;
  }

  return pieces
    .filter((piece) => piece.id !== pieceId)
    .map((piece) =>
      piece.id === deletedPiece.symmetry?.pairId
        ? {
            ...piece,
            symmetry: undefined,
          }
        : piece,
    );
}

export function updatePiecePositionInPieces(
  pieces: PatternPiece[],
  pieceId: string,
  x: number,
  y: number,
) {
  return pieces.map((piece) =>
    piece.id === pieceId
      ? {
          ...piece,
          x,
          y,
        }
      : piece,
  );
}

export function updatePieceMetadataInPieces(
  pieces: PatternPiece[],
  pieceId: string,
  metadata: PieceMetadata,
) {
  const pair = getPiecePair(pieces, pieceId);

  return pieces.map((piece) =>
    piece.id === pieceId || piece.id === pair?.linkedPiece?.id
      ? {
          ...piece,
          ...metadata,
        }
      : piece,
  );
}

export function duplicatePatternPiece(
  piece: PatternPiece,
  pieceId: string,
  makePointId: () => string,
  offset: PointPosition,
): PatternPiece {
  return {
    ...piece,
    id: pieceId,
    name: `${piece.name} Copy`,
    x: piece.x + offset.x,
    y: piece.y + offset.y,
    symmetry: undefined,
    points: piece.points.map((point) => ({
      ...point,
      id: makePointId(),
      curveIn: point.curveIn ? { ...point.curveIn } : undefined,
      curveOut: point.curveOut ? { ...point.curveOut } : undefined,
    })),
  };
}

function updatePairedPoints(
  pieces: PatternPiece[],
  pieceId: string,
  updatePoints: (editedPiece: PatternPiece) => PatternPoint[],
) {
  const pair = getPiecePair(pieces, pieceId);

  if (!pair) {
    return pieces;
  }

  const updatedEditedPiece = {
    ...pair.editedPiece,
    points: updatePoints(pair.editedPiece),
  };
  const linkedPiece = pair.linkedPiece;

  return pieces.map((piece) => {
    if (piece.id === updatedEditedPiece.id) {
      return updatedEditedPiece;
    }

    if (piece.id !== linkedPiece?.id || !linkedPiece) {
      return piece;
    }

    return {
      ...piece,
      points: updatedEditedPiece.points.map((point) =>
        getSymmetricPatternPoint(point, updatedEditedPiece, linkedPiece),
      ),
    };
  });
}

function insertPatternPointIntoPoints(
  points: PatternPoint[],
  afterPointId: string,
  point: PatternPoint,
  progress = 0.5,
) {
  const insertIndex = points.findIndex(
    (currentPoint) => currentPoint.id === afterPointId,
  );

  if (insertIndex === -1) {
    return points;
  }

  const endIndex = (insertIndex + 1) % points.length;
  const start = points[insertIndex];
  const end = points[endIndex];
  const isBezier = Boolean(start.curveOut || end.curveIn);

  if (!isBezier) {
    return [
      ...points.slice(0, insertIndex + 1),
      point,
      ...points.slice(insertIndex + 1),
    ];
  }

  const split = getSplitCubicBezier(
    start,
    start.curveOut ?? start,
    end.curveIn ?? end,
    end,
    progress,
  );
  const updatedStart = {
    ...start,
    curveOut: split.first.controlA,
  };
  const insertedPoint = {
    ...point,
    ...split.point,
    curveIn: split.first.controlB,
    curveOut: split.second.controlA,
  };
  const updatedEnd = {
    ...end,
    curveIn: split.second.controlB,
  };
  const updatedPoints = points.map((currentPoint, index) => {
    if (index === insertIndex) {
      return updatedStart;
    }

    if (index === endIndex) {
      return updatedEnd;
    }

    return currentPoint;
  });

  return [
    ...updatedPoints.slice(0, insertIndex + 1),
    insertedPoint,
    ...updatedPoints.slice(insertIndex + 1),
  ];
}

function movePatternPoint(
  point: PatternPoint,
  deltaX: number,
  deltaY: number,
  position?: PointPosition,
) {
  return {
    ...point,
    x: position?.x ?? point.x + deltaX,
    y: position?.y ?? point.y + deltaY,
    curveIn: point.curveIn
      ? {
          x: point.curveIn.x + deltaX,
          y: point.curveIn.y + deltaY,
        }
      : undefined,
    curveOut: point.curveOut
      ? {
          x: point.curveOut.x + deltaX,
          y: point.curveOut.y + deltaY,
        }
      : undefined,
  };
}

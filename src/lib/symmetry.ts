import type { PatternPiece, PatternPoint, PointPosition } from "../types";
import { mirrorPointPosition } from "./geometry";

const MIRROR_GAP_MM = 80;

export function getPieceBounds(points: PatternPoint[]) {
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      maxX: Math.max(bounds.maxX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
}

export function getSymmetricLocalPosition(
  point: PointPosition,
  editedPiece: PatternPiece,
  linkedPiece: PatternPiece,
) {
  const axisX = editedPiece.symmetry?.axisX ?? 0;
  const worldPoint = {
    x: editedPiece.x + point.x,
    y: editedPiece.y + point.y,
  };
  const mirroredWorldPoint = mirrorPointPosition(worldPoint, axisX);

  return {
    x: mirroredWorldPoint.x - linkedPiece.x,
    y: mirroredWorldPoint.y - linkedPiece.y,
  };
}

export function getSymmetricPatternPoint(
  point: PatternPoint,
  editedPiece: PatternPiece,
  linkedPiece: PatternPiece,
) {
  return {
    ...point,
    ...getSymmetricLocalPosition(point, editedPiece, linkedPiece),
    curveIn: point.curveIn
      ? getSymmetricLocalPosition(point.curveIn, editedPiece, linkedPiece)
      : undefined,
    curveOut: point.curveOut
      ? getSymmetricLocalPosition(point.curveOut, editedPiece, linkedPiece)
      : undefined,
  };
}

export function createSymmetricPiecePair(
  selectedPiece: PatternPiece,
  mirroredPieceId: string,
  gapMm = MIRROR_GAP_MM,
) {
  const bounds = getPieceBounds(selectedPiece.points);
  const pieceWidth = bounds.maxX - bounds.minX;
  const mirroredPieceX = selectedPiece.x + pieceWidth + gapMm;
  const axisX = selectedPiece.x + bounds.maxX + gapMm / 2;

  const sourcePiece: PatternPiece = {
    ...selectedPiece,
    symmetry: {
      pairId: mirroredPieceId,
      role: "source",
      axisX,
    },
  };

  const mirroredBasePiece: PatternPiece = {
    ...selectedPiece,
    id: mirroredPieceId,
    name: `${selectedPiece.name} Mirror`,
    x: mirroredPieceX,
    symmetry: {
      pairId: selectedPiece.id,
      role: "mirror",
      axisX,
    },
  };

  return {
    sourcePiece,
    mirroredPiece: {
      ...mirroredBasePiece,
      points: selectedPiece.points.map((point) =>
        getSymmetricPatternPoint(point, sourcePiece, mirroredBasePiece),
      ),
    },
  };
}

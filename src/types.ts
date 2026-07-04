export type PointPosition = {
  x: number;
  y: number;
};

export type PatternPoint = PointPosition & {
  id: string;
};

export type PatternPiece = {
  id: string;
  name: string;
  lengthMm: number;
  cornerRadiusMm: number;
  quantity: number;
  notes: string;
  points: PatternPoint[];
  x: number;
  y: number;
};

export type Tool = "select" | "draw";

export type Camera = PointPosition & {
  scale: number;
};

export type Viewport = {
  width: number;
  height: number;
};

export type PieceMetadata = Partial<
  Pick<PatternPiece, "name" | "lengthMm" | "cornerRadiusMm" | "quantity" | "notes">
>;

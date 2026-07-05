export type PointPosition = {
  x: number;
  y: number;
};

export type PatternPoint = PointPosition & {
  id: string;
  curveIn?: PointPosition;
  curveOut?: PointPosition;
};

export type CurveHandle = "curveIn" | "curveOut";

export type FocusedCurveHandle = {
  pointId: string;
  handle: CurveHandle;
};

export type PreviewTransform = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale?: [number, number, number];
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

  previewTransform?: PreviewTransform;

  symmetry?: {
    pairId: string;
    role: "source" | "mirror";
    axisX: number;
  };
};

export type Tool = "select" | "draw";

export type PieceTool = "move" | "add-point" | "curve";

export type Camera = PointPosition & {
  scale: number;
};

export type Viewport = {
  width: number;
  height: number;
};

export type PieceMetadata = Partial<
  Pick<
    PatternPiece,
    "name" | "lengthMm" | "cornerRadiusMm" | "quantity" | "notes"
  >
>;

export type PiecePreviewTransformUpdate = {
  pieceId: string;
  previewTransform: PreviewTransform;
};

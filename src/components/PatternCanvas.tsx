import type Konva from "konva";
import { Circle, Group, Layer, Line, Rect, Shape, Stage, Text } from "react-konva";

import {
  drawPatternOutline,
  getClosestPointOnSegment,
  getLineLength,
  getPointAngle,
  getReadableLineRotation,
  snapToGrid,
} from "../lib/geometry";
import {
  GRID_SIZE_MM,
  MAX_ZOOM,
  MIN_ZOOM,
  MM_TO_PX,
  ZOOM_STEP,
} from "../lib/patternConfig";
import type {
  Camera,
  PatternPiece,
  PatternPoint,
  PointPosition,
  Tool,
  Viewport,
} from "../types";

type PatternCanvasProps = {
  activeTool: Tool;
  camera: Camera;
  draftCursor: PointPosition | null;
  draftPoints: PatternPoint[];
  isPanning: boolean;
  lastPointerPosition: PointPosition | null;
  pieces: PatternPiece[];
  selectedPieceId: string | null;
  viewport: Viewport;
  makeId: (prefix: string) => string;
  onAddDraftPoint: (point: PatternPoint) => void;
  onClearSelection: () => void;
  onDeletePatternPoint: (pieceId: string, pointId: string) => void;
  onInsertPatternPoint: (
    pieceId: string,
    afterPointId: string,
    point: PointPosition,
  ) => void;
  onSelectPiece: (pieceId: string) => void;
  onSetCamera: React.Dispatch<React.SetStateAction<Camera>>;
  onSetDraftCursor: (point: PointPosition | null) => void;
  onSetIsPanning: (isPanning: boolean) => void;
  onSetLastPointerPosition: (point: PointPosition | null) => void;
  onUpdatePatternPoint: (
    pieceId: string,
    pointId: string,
    x: number,
    y: number,
  ) => void;
  onUpdatePiecePosition: (pieceId: string, x: number, y: number) => void;
};

function getGridOffset(position: number, spacing: number) {
  return ((position % spacing) + spacing) % spacing;
}

export function PatternCanvas({
  activeTool,
  camera,
  draftCursor,
  draftPoints,
  isPanning,
  lastPointerPosition,
  pieces,
  selectedPieceId,
  viewport,
  makeId,
  onAddDraftPoint,
  onClearSelection,
  onDeletePatternPoint,
  onInsertPatternPoint,
  onSelectPiece,
  onSetCamera,
  onSetDraftCursor,
  onSetIsPanning,
  onSetLastPointerPosition,
  onUpdatePatternPoint,
  onUpdatePiecePosition,
}: PatternCanvasProps) {
  function screenToPatternPoint(screenPoint: PointPosition) {
    return {
      x: snapToGrid((screenPoint.x - camera.x) / (MM_TO_PX * camera.scale)),
      y: snapToGrid((screenPoint.y - camera.y) / (MM_TO_PX * camera.scale)),
    };
  }

  function screenToPiecePoint(piece: PatternPiece, screenPoint: PointPosition) {
    return {
      x: (screenPoint.x - camera.x) / (MM_TO_PX * camera.scale) - piece.x,
      y: (screenPoint.y - camera.y) / (MM_TO_PX * camera.scale) - piece.y,
    };
  }

  const minorGridSizePx = GRID_SIZE_MM * MM_TO_PX * camera.scale;
  const majorGridSizePx = minorGridSizePx * 5;
  const minorGridLines = [];
  const majorGridLines = [];
  const minorOffsetX = getGridOffset(camera.x, minorGridSizePx);
  const minorOffsetY = getGridOffset(camera.y, minorGridSizePx);
  const majorOffsetX = getGridOffset(camera.x, majorGridSizePx);
  const majorOffsetY = getGridOffset(camera.y, majorGridSizePx);

  for (
    let x = minorOffsetX - minorGridSizePx;
    x <= viewport.width + minorGridSizePx;
    x += minorGridSizePx
  ) {
    minorGridLines.push(
      <Line
        key={`minor-vertical-${x}`}
        points={[x, 0, x, viewport.height]}
        stroke="#ececec"
        strokeWidth={1}
      />,
    );
  }

  for (
    let y = minorOffsetY - minorGridSizePx;
    y <= viewport.height + minorGridSizePx;
    y += minorGridSizePx
  ) {
    minorGridLines.push(
      <Line
        key={`minor-horizontal-${y}`}
        points={[0, y, viewport.width, y]}
        stroke="#ececec"
        strokeWidth={1}
      />,
    );
  }

  for (
    let x = majorOffsetX - majorGridSizePx;
    x <= viewport.width + majorGridSizePx;
    x += majorGridSizePx
  ) {
    majorGridLines.push(
      <Line
        key={`major-vertical-${x}`}
        points={[x, 0, x, viewport.height]}
        stroke="#d8d8d8"
        strokeWidth={1}
      />,
    );
  }

  for (
    let y = majorOffsetY - majorGridSizePx;
    y <= viewport.height + majorGridSizePx;
    y += majorGridSizePx
  ) {
    majorGridLines.push(
      <Line
        key={`major-horizontal-${y}`}
        points={[0, y, viewport.width, y]}
        stroke="#d8d8d8"
        strokeWidth={1}
      />,
    );
  }

  return (
    <Stage
      width={viewport.width}
      height={viewport.height}
      onWheel={(event) => {
        event.evt.preventDefault();

        const stage = event.target.getStage();
        const pointer = stage?.getPointerPosition();

        if (!pointer) {
          return;
        }

        if (!event.evt.ctrlKey) {
          onSetCamera((currentCamera) => ({
            ...currentCamera,
            x: currentCamera.x - event.evt.deltaX,
            y: currentCamera.y - event.evt.deltaY,
          }));
          return;
        }

        onSetCamera((currentCamera) => {
          const zoomDirection = event.evt.deltaY > 0 ? -1 : 1;

          const newScale = Math.min(
            MAX_ZOOM,
            Math.max(
              MIN_ZOOM,
              currentCamera.scale * Math.pow(ZOOM_STEP, zoomDirection),
            ),
          );

          const worldPointUnderCursor = {
            x: (pointer.x - currentCamera.x) / currentCamera.scale,
            y: (pointer.y - currentCamera.y) / currentCamera.scale,
          };

          return {
            scale: newScale,
            x: pointer.x - worldPointUnderCursor.x * newScale,
            y: pointer.y - worldPointUnderCursor.y * newScale,
          };
        });
      }}
      onMouseDown={(event) => {
        const stage = event.target.getStage();

        if (!stage) {
          return;
        }

        const pointer = stage.getPointerPosition();

        if (!pointer) {
          return;
        }

        if (activeTool === "select" && event.target === stage) {
          onClearSelection();
          onSetIsPanning(true);
          onSetLastPointerPosition(pointer);
          return;
        }

        if (activeTool !== "draw" || event.target !== stage) {
          return;
        }

        const point = screenToPatternPoint(pointer);

        onAddDraftPoint({
          id: makeId("point"),
          ...point,
        });
      }}
      onMouseMove={(event) => {
        const pointer = event.target.getStage()?.getPointerPosition();

        if (!pointer) {
          return;
        }

        if (activeTool === "draw" && !isPanning) {
          onSetDraftCursor(screenToPatternPoint(pointer));
        }

        if (!isPanning || !lastPointerPosition) {
          return;
        }

        const deltaX = pointer.x - lastPointerPosition.x;
        const deltaY = pointer.y - lastPointerPosition.y;

        onSetCamera((currentCamera) => ({
          ...currentCamera,
          x: currentCamera.x + deltaX,
          y: currentCamera.y + deltaY,
        }));

        onSetLastPointerPosition(pointer);
      }}
      onMouseUp={() => {
        onSetIsPanning(false);
        onSetLastPointerPosition(null);
      }}
      onMouseLeave={() => {
        onSetIsPanning(false);
        onSetLastPointerPosition(null);
      }}
    >
      <Layer listening={false}>
        {minorGridLines}
        {majorGridLines}
      </Layer>

      <Layer>
        <Group
          x={camera.x}
          y={camera.y}
          scaleX={MM_TO_PX * camera.scale}
          scaleY={MM_TO_PX * camera.scale}
        >
          {pieces.map((piece) => {
            const isSelected = piece.id === selectedPieceId;

            const edges = piece.points
              .map((start, index) => {
                const end = piece.points[(index + 1) % piece.points.length];
                const length = getLineLength(start, end);

                if (length === 0) {
                  return null;
                }

                const dx = end.x - start.x;
                const dy = end.y - start.y;

                return {
                  id: `${start.id}-${end.id}`,
                  start,
                  end,
                  length,
                  midpoint: {
                    x: (start.x + end.x) / 2,
                    y: (start.y + end.y) / 2,
                  },
                  normal: {
                    x: -dy / length,
                    y: dx / length,
                  },
                  rotation: getReadableLineRotation(start, end),
                };
              })
              .filter((edge) => edge !== null);

            const angles = piece.points
              .map((point, index) => {
                const previous =
                  piece.points[
                    (index - 1 + piece.points.length) % piece.points.length
                  ];

                const next = piece.points[(index + 1) % piece.points.length];
                const angle = getPointAngle(previous, point, next);

                if (angle === null) {
                  return null;
                }

                const previousVector = {
                  x: previous.x - point.x,
                  y: previous.y - point.y,
                };

                const nextVector = {
                  x: next.x - point.x,
                  y: next.y - point.y,
                };

                const previousLength = Math.hypot(
                  previousVector.x,
                  previousVector.y,
                );

                const nextLength = Math.hypot(nextVector.x, nextVector.y);

                const direction = {
                  x:
                    previousVector.x / previousLength +
                    nextVector.x / nextLength,
                  y:
                    previousVector.y / previousLength +
                    nextVector.y / nextLength,
                };

                const directionLength = Math.hypot(direction.x, direction.y);

                return {
                  id: point.id,
                  point,
                  angle,
                  direction:
                    directionLength === 0
                      ? { x: 0, y: -1 }
                      : {
                          x: direction.x / directionLength,
                          y: direction.y / directionLength,
                        },
                };
              })
              .filter((angle) => angle !== null);

            return (
              <Group
                key={piece.id}
                x={piece.x}
                y={piece.y}
                draggable={activeTool === "select" && isSelected}
                onClick={() => {
                  if (activeTool === "select") {
                    onSelectPiece(piece.id);
                  }
                }}
                onTap={() => {
                  if (activeTool === "select") {
                    onSelectPiece(piece.id);
                  }
                }}
                onDragStart={() => {
                  onSelectPiece(piece.id);
                }}
                onDragMove={(event) => {
                  if (event.target !== event.currentTarget) {
                    return;
                  }

                  onUpdatePiecePosition(
                    piece.id,
                    event.target.x(),
                    event.target.y(),
                  );
                }}
                onDragEnd={(event) => {
                  if (event.target !== event.currentTarget) {
                    return;
                  }

                  const x = snapToGrid(event.target.x());
                  const y = snapToGrid(event.target.y());

                  onUpdatePiecePosition(piece.id, x, y);
                  event.target.position({ x, y });
                }}
              >
                <Shape
                  sceneFunc={(context, shape) => {
                    drawPatternOutline(
                      context,
                      shape,
                      piece.points,
                      piece.cornerRadiusMm,
                    );
                  }}
                  fill={
                    isSelected
                      ? "rgba(220, 235, 255, 0.9)"
                      : "rgba(255, 255, 255, 0.85)"
                  }
                  stroke={isSelected ? "#2563eb" : "#171717"}
                  strokeWidth={(isSelected ? 1.5 : 1) / camera.scale}
                />

                {isSelected &&
                  edges.map((edge) => {
                    function handleInsertPoint(
                      event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
                    ) {
                      event.cancelBubble = true;

                      const pointer = event.target.getStage()?.getPointerPosition();

                      if (!pointer) {
                        return;
                      }

                      const localPointer = screenToPiecePoint(piece, pointer);
                      const newPoint = getClosestPointOnSegment(
                        localPointer,
                        edge.start,
                        edge.end,
                      );

                      if (
                        getLineLength(newPoint, edge.start) < 1 ||
                        getLineLength(newPoint, edge.end) < 1
                      ) {
                        return;
                      }

                      onInsertPatternPoint(piece.id, edge.start.id, newPoint);
                    }

                    return (
                      <Line
                        key={`insert-hit-${edge.id}`}
                        points={[
                          edge.start.x,
                          edge.start.y,
                          edge.end.x,
                          edge.end.y,
                        ]}
                        stroke="rgba(37, 99, 235, 0.01)"
                        strokeWidth={10 / camera.scale}
                        hitStrokeWidth={14 / camera.scale}
                        onDblClick={handleInsertPoint}
                        onDblTap={handleInsertPoint}
                      />
                    );
                  })}

                {isSelected &&
                  edges.map((edge) => {
                    const labelText = `${Math.round(edge.length)} mm`;
                    const labelWidth = 58 / (MM_TO_PX * camera.scale);
                    const labelHeight = 18 / (MM_TO_PX * camera.scale);
                    const labelOffset = 13 / (MM_TO_PX * camera.scale);
                    const labelX =
                      edge.midpoint.x + edge.normal.x * labelOffset;
                    const labelY =
                      edge.midpoint.y + edge.normal.y * labelOffset;

                    return (
                      <Group
                        key={edge.id}
                        x={labelX}
                        y={labelY}
                        rotation={edge.rotation}
                        listening={false}
                      >
                        <Rect
                          x={-labelWidth / 2}
                          y={-labelHeight / 2}
                          width={labelWidth}
                          height={labelHeight}
                          fill="rgba(255, 255, 255, 0.94)"
                          stroke="#93c5fd"
                          strokeWidth={0.75 / camera.scale}
                          cornerRadius={3 / camera.scale}
                        />

                        <Text
                          x={-labelWidth / 2}
                          y={-labelHeight / 2 + 2 / camera.scale}
                          width={labelWidth}
                          text={labelText}
                          align="center"
                          fontSize={10 / (MM_TO_PX * camera.scale)}
                          fill="#1d4ed8"
                        />
                      </Group>
                    );
                  })}

                {isSelected &&
                  angles.map((corner) => {
                    const labelText = `${Math.round(corner.angle)}°`;
                    const labelWidth = 42 / (MM_TO_PX * camera.scale);
                    const labelHeight = 18 / (MM_TO_PX * camera.scale);
                    const labelOffset = 24 / (MM_TO_PX * camera.scale);

                    return (
                      <Group
                        key={`angle-${corner.id}`}
                        x={corner.point.x + corner.direction.x * labelOffset}
                        y={corner.point.y + corner.direction.y * labelOffset}
                        listening={false}
                      >
                        <Rect
                          x={-labelWidth / 2}
                          y={-labelHeight / 2}
                          width={labelWidth}
                          height={labelHeight}
                          fill="rgba(255, 255, 255, 0.94)"
                          stroke="#f59e0b"
                          strokeWidth={0.75 / camera.scale}
                          cornerRadius={3 / camera.scale}
                        />

                        <Text
                          x={-labelWidth / 2}
                          y={-labelHeight / 2 + 2 / camera.scale}
                          width={labelWidth}
                          text={labelText}
                          align="center"
                          fontSize={10 / (MM_TO_PX * camera.scale)}
                          fill="#b45309"
                        />
                      </Group>
                    );
                  })}

                {isSelected &&
                  piece.points.map((point) => (
                    <Circle
                      key={point.id}
                      x={point.x}
                      y={point.y}
                      radius={4 / camera.scale}
                      fill="#ffffff"
                      stroke="#2563eb"
                      strokeWidth={1 / camera.scale}
                      draggable={activeTool === "select"}
                      onMouseDown={(event) => {
                        event.cancelBubble = true;
                      }}
                      onTouchStart={(event) => {
                        event.cancelBubble = true;
                      }}
                      onDblClick={(event) => {
                        event.cancelBubble = true;
                        onDeletePatternPoint(piece.id, point.id);
                      }}
                      onDblTap={(event) => {
                        event.cancelBubble = true;
                        onDeletePatternPoint(piece.id, point.id);
                      }}
                      onDragMove={(event) => {
                        event.cancelBubble = true;

                        const position = event.target.position();
                        const x = snapToGrid(position.x);
                        const y = snapToGrid(position.y);

                        onUpdatePatternPoint(piece.id, point.id, x, y);
                        event.target.position({ x, y });
                      }}
                      onDragEnd={(event) => {
                        event.cancelBubble = true;

                        const position = event.target.position();
                        const x = snapToGrid(position.x);
                        const y = snapToGrid(position.y);

                        onUpdatePatternPoint(piece.id, point.id, x, y);
                        event.target.position({ x, y });
                      }}
                    />
                  ))}

                <Text
                  x={piece.points[0].x}
                  y={piece.points[0].y - 18}
                  text={piece.name.toUpperCase()}
                  fontSize={12 / camera.scale}
                  fill={isSelected ? "#2563eb" : "#555555"}
                  listening={false}
                />

                {piece.cornerRadiusMm > 0 && (
                  <Text
                    x={piece.points[0].x}
                    y={piece.points[0].y - 4}
                    text={`R ${Math.round(piece.cornerRadiusMm)} mm`}
                    fontSize={10 / camera.scale}
                    fill={isSelected ? "#047857" : "#666666"}
                    listening={false}
                  />
                )}
              </Group>
            );
          })}

          {draftPoints.length > 0 && (
            <Line
              points={draftPoints.flatMap((point) => [point.x, point.y])}
              stroke="#555555"
              strokeWidth={1 / camera.scale}
              dash={[6 / camera.scale, 6 / camera.scale]}
              listening={false}
            />
          )}

          {draftPoints.length > 0 && draftCursor && (
            <Line
              points={[
                draftPoints[draftPoints.length - 1].x,
                draftPoints[draftPoints.length - 1].y,
                draftCursor.x,
                draftCursor.y,
              ]}
              stroke="#777777"
              strokeWidth={1 / camera.scale}
              dash={[4 / camera.scale, 4 / camera.scale]}
              listening={false}
            />
          )}

          {draftPoints.map((point) => (
            <Circle
              key={point.id}
              x={point.x}
              y={point.y}
              radius={4 / camera.scale}
              fill="#171717"
            />
          ))}
        </Group>
      </Layer>

      <Layer listening={false}>
        <Text
          x={20}
          y={20}
          text="SWIRSKI PATTERN LAB"
          fontSize={18}
          fontStyle="bold"
          fill="#111111"
        />

        <Text
          x={20}
          y={48}
          text="Select: drag empty space to pan • Drag nodes to reshape • Double-click edge to add point • Double-click node to delete"
          fontSize={13}
          fill="#666666"
        />

        <Text
          x={20}
          y={viewport.height - 32}
          text={`Zoom: ${Math.round(camera.scale * 100)}% • Grid: ${GRID_SIZE_MM} mm`}
          fontSize={13}
          fill="#666666"
        />
      </Layer>
    </Stage>
  );
}

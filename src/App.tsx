import { useEffect, useState, useCallback, useRef } from "react";
import type Konva from "konva";
import { Circle, Group, Layer, Line, Rect, Shape, Stage, Text } from "react-konva";

const MM_TO_PX = 2;
const GRID_SIZE_MM = 10;
const ZOOM_STEP = 1.1;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

type PatternPoint = {
  id: string;
  x: number;
  y: number;
};

type PointPosition = {
  x: number;
  y: number;
};

type PatternPiece = {
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

type Tool = "select" | "draw";

function snapToGrid(value: number) {
  return Math.round(value / GRID_SIZE_MM) * GRID_SIZE_MM;
}

function getNumericInputValue(value: string, minimum: number) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? Math.max(minimum, numberValue) : minimum;
}

function getLineLength(start: PointPosition, end: PointPosition) {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function getClosestPointOnSegment(
  point: PointPosition,
  start: PointPosition,
  end: PointPosition,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return start;
  }

  const progress = Math.min(
    1,
    Math.max(
      0,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );

  return {
    x: start.x + dx * progress,
    y: start.y + dy * progress,
  };
}

function getPiecePerimeter(points: PatternPoint[]) {
  return points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];

    return total + getLineLength(point, next);
  }, 0);
}

function drawPatternOutline(
  context: Konva.Context,
  shape: Konva.Shape,
  points: PatternPoint[],
  cornerRadiusMm: number,
) {
  if (points.length === 0) {
    return;
  }

  if (points.length < 3 || cornerRadiusMm <= 0) {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);

    points.slice(1).forEach((point) => {
      context.lineTo(point.x, point.y);
    });

    context.closePath();
    context.fillStrokeShape(shape);
    return;
  }

  context.beginPath();

  points.forEach((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const previousLength = getLineLength(point, previous);
    const nextLength = getLineLength(point, next);
    const radius = Math.min(
      cornerRadiusMm,
      previousLength / 2,
      nextLength / 2,
    );

    if (radius <= 0 || previousLength === 0 || nextLength === 0) {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }

      return;
    }

    const beforeCorner = {
      x: point.x + ((previous.x - point.x) / previousLength) * radius,
      y: point.y + ((previous.y - point.y) / previousLength) * radius,
    };

    const afterCorner = {
      x: point.x + ((next.x - point.x) / nextLength) * radius,
      y: point.y + ((next.y - point.y) / nextLength) * radius,
    };

    if (index === 0) {
      context.moveTo(beforeCorner.x, beforeCorner.y);
    } else {
      context.lineTo(beforeCorner.x, beforeCorner.y);
    }

    context.quadraticCurveTo(
      point.x,
      point.y,
      afterCorner.x,
      afterCorner.y,
    );
  });

  context.closePath();
  context.fillStrokeShape(shape);
}

function getReadableLineRotation(start: PatternPoint, end: PatternPoint) {
  let rotation = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;

  // Prevent upside-down labels.
  if (rotation > 90 || rotation < -90) {
    rotation += 180;
  }

  return rotation;
}

function getPointAngle(
  previous: PatternPoint,
  point: PatternPoint,
  next: PatternPoint,
) {
  const previousVector = {
    x: previous.x - point.x,
    y: previous.y - point.y,
  };

  const nextVector = {
    x: next.x - point.x,
    y: next.y - point.y,
  };

  const previousLength = Math.hypot(previousVector.x, previousVector.y);
  const nextLength = Math.hypot(nextVector.x, nextVector.y);

  if (previousLength === 0 || nextLength === 0) {
    return null;
  }

  const cosine =
    (previousVector.x * nextVector.x + previousVector.y * nextVector.y) /
    (previousLength * nextLength);

  return (
    (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) /
    Math.PI
  );
}

function App() {
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const [camera, setCamera] = useState({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    scale: 1,
  });

  const [isPanning, setIsPanning] = useState(false);

  const [lastPointerPosition, setLastPointerPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const nextId = useRef(1);

  function makeId(prefix: string) {
    const id = `${prefix}-${nextId.current}`;
    nextId.current += 1;
    return id;
  }

  const [activeTool, setActiveTool] = useState<Tool>("select");

  const [pieces, setPieces] = useState<PatternPiece[]>([
    {
      id: "front-panel",
      name: "Front Panel",
      lengthMm: 0,
      cornerRadiusMm: 0,
      quantity: 1,
      notes: "",
      points: [
        { id: "top-left", x: -120, y: -160 },
        { id: "top-right", x: 120, y: -160 },
        { id: "bottom-right", x: 140, y: 180 },
        { id: "bottom-left", x: -140, y: 180 },
      ],
      x: 0,
      y: 0,
    },
  ]);

  const [draftPoints, setDraftPoints] = useState<PatternPoint[]>([]);
  const [draftCursor, setDraftCursor] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);

  function screenToPatternPoint(screenPoint: { x: number; y: number }) {
    return {
      x: snapToGrid((screenPoint.x - camera.x) / (MM_TO_PX * camera.scale)),
      y: snapToGrid((screenPoint.y - camera.y) / (MM_TO_PX * camera.scale)),
    };
  }

  function screenToPiecePoint(
    piece: PatternPiece,
    screenPoint: { x: number; y: number },
  ) {
    return {
      x: (screenPoint.x - camera.x) / (MM_TO_PX * camera.scale) - piece.x,
      y: (screenPoint.y - camera.y) / (MM_TO_PX * camera.scale) - piece.y,
    };
  }

  function updatePatternPoint(
    pieceId: string,
    pointId: string,
    x: number,
    y: number,
  ) {
    setPieces((currentPieces) =>
      currentPieces.map((piece) => {
        if (piece.id !== pieceId) {
          return piece;
        }

        return {
          ...piece,
          points: piece.points.map((point) =>
            point.id === pointId ? { ...point, x, y } : point,
          ),
        };
      }),
    );
  }

  function insertPatternPoint(
    pieceId: string,
    afterPointId: string,
    point: PointPosition,
  ) {
    const newPoint = {
      id: makeId("point"),
      ...point,
    };

    setPieces((currentPieces) =>
      currentPieces.map((piece) => {
        if (piece.id !== pieceId) {
          return piece;
        }

        const insertIndex = piece.points.findIndex(
          (currentPoint) => currentPoint.id === afterPointId,
        );

        if (insertIndex === -1) {
          return piece;
        }

        return {
          ...piece,
          points: [
            ...piece.points.slice(0, insertIndex + 1),
            newPoint,
            ...piece.points.slice(insertIndex + 1),
          ],
        };
      }),
    );
  }

  function updatePiecePosition(pieceId: string, x: number, y: number) {
    setPieces((currentPieces) =>
      currentPieces.map((piece) =>
        piece.id === pieceId
          ? {
              ...piece,
              x,
              y,
            }
          : piece,
      ),
    );
  }

  function updatePieceMetadata(
    pieceId: string,
    metadata: Partial<
      Pick<
        PatternPiece,
        "name" | "lengthMm" | "cornerRadiusMm" | "quantity" | "notes"
      >
    >,
  ) {
    setPieces((currentPieces) =>
      currentPieces.map((piece) =>
        piece.id === pieceId
          ? {
              ...piece,
              ...metadata,
            }
          : piece,
      ),
    );
  }

  const finishDraftPiece = useCallback(() => {
    if (draftPoints.length < 3) {
      return;
    }

    setPieces((currentPieces) => [
      ...currentPieces,
      {
        id: makeId("piece"),
        name: `Pattern Piece ${currentPieces.length + 1}`,
        lengthMm: 0,
        cornerRadiusMm: 0,
        quantity: 1,
        notes: "",
        points: draftPoints,
        x: 0,
        y: 0,
      },
    ]);

    setDraftPoints([]);
    setDraftCursor(null);
    setActiveTool("select");
  }, [draftPoints]);

  useEffect(() => {
    function handleResize() {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    function handleDraftKeyboardShortcuts(event: KeyboardEvent) {
      if (activeTool !== "draw") {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        finishDraftPiece();
      }

      if (event.key === "Escape") {
        setDraftPoints([]);
        setDraftCursor(null);
        setActiveTool("select");
      }
    }

    window.addEventListener("keydown", handleDraftKeyboardShortcuts);

    return () => {
      window.removeEventListener("keydown", handleDraftKeyboardShortcuts);
    };
  }, [activeTool, finishDraftPiece]);

  const minorGridSizePx = GRID_SIZE_MM * MM_TO_PX * camera.scale;
  const majorGridSizePx = minorGridSizePx * 5;

  const minorGridLines = [];
  const majorGridLines = [];

  function getGridOffset(position: number, spacing: number) {
    return ((position % spacing) + spacing) % spacing;
  }

  const minorOffsetX = getGridOffset(camera.x, minorGridSizePx);
  const minorOffsetY = getGridOffset(camera.y, minorGridSizePx);

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

  const majorOffsetX = getGridOffset(camera.x, majorGridSizePx);
  const majorOffsetY = getGridOffset(camera.y, majorGridSizePx);

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

  const selectedPiece =
    pieces.find((piece) => piece.id === selectedPieceId) ?? null;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        cursor: isPanning
          ? "grabbing"
          : activeTool === "draw"
            ? "crosshair"
            : "grab",
      }}
    >
      <div className="toolbar">
        <button
          className={activeTool === "select" ? "active" : ""}
          onClick={() => setActiveTool("select")}
        >
          Select
        </button>

        <button
          className={activeTool === "draw" ? "active" : ""}
          onClick={() => setActiveTool("draw")}
        >
          Draw Piece
        </button>

        {activeTool === "draw" && (
          <>
            <button
              onClick={finishDraftPiece}
              disabled={draftPoints.length < 3}
            >
              Finish
            </button>

            <button
              onClick={() => {
                setDraftPoints([]);
                setDraftCursor(null);
                setActiveTool("select");
              }}
            >
              Cancel
            </button>
          </>
        )}
      </div>

      {selectedPiece && (
        <aside className="piece-inspector" aria-label="Selected piece metadata">
          <div className="piece-inspector__header">
            <div>
              <p className="piece-inspector__eyebrow">Selected piece</p>
              <h2>{selectedPiece.name}</h2>
            </div>

            <button
              type="button"
              className="piece-inspector__close"
              onClick={() => setSelectedPieceId(null)}
              aria-label="Close selected piece metadata"
            >
              x
            </button>
          </div>

          <label className="field">
            <span>Name</span>
            <input
              value={selectedPiece.name}
              onChange={(event) =>
                updatePieceMetadata(selectedPiece.id, {
                  name: event.target.value,
                })
              }
            />
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Length mm</span>
              <input
                type="number"
                min="0"
                step="1"
                value={selectedPiece.lengthMm}
                onChange={(event) =>
                  updatePieceMetadata(selectedPiece.id, {
                    lengthMm: getNumericInputValue(event.target.value, 0),
                  })
                }
              />
            </label>

            <label className="field">
              <span>Corner radius mm</span>
              <input
                type="number"
                min="0"
                step="1"
                value={selectedPiece.cornerRadiusMm}
                onChange={(event) =>
                  updatePieceMetadata(selectedPiece.id, {
                    cornerRadiusMm: getNumericInputValue(
                      event.target.value,
                      0,
                    ),
                  })
                }
              />
            </label>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Quantity</span>
              <input
                type="number"
                min="1"
                step="1"
                value={selectedPiece.quantity}
                onChange={(event) =>
                  updatePieceMetadata(selectedPiece.id, {
                    quantity: getNumericInputValue(event.target.value, 1),
                  })
                }
              />
            </label>

            <div className="metric">
              <span>Perimeter</span>
              <strong>
                {Math.round(getPiecePerimeter(selectedPiece.points))} mm
              </strong>
            </div>
          </div>

          <label className="field">
            <span>Notes</span>
            <textarea
              rows={3}
              value={selectedPiece.notes}
              onChange={(event) =>
                updatePieceMetadata(selectedPiece.id, {
                  notes: event.target.value,
                })
              }
            />
          </label>
        </aside>
      )}

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
            setCamera((currentCamera) => ({
              ...currentCamera,
              x: currentCamera.x - event.evt.deltaX,
              y: currentCamera.y - event.evt.deltaY,
            }));
            return;
          }

          setCamera((currentCamera) => {
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

          // In Select mode, dragging empty workspace pans the camera.
          if (activeTool === "select" && event.target === stage) {
            setSelectedPieceId(null);
            setIsPanning(true);
            setLastPointerPosition(pointer);
            return;
          }

          // In Draw mode, clicking empty workspace creates a pattern point.
          if (activeTool !== "draw" || event.target !== stage) {
            return;
          }

          const point = screenToPatternPoint(pointer);

          setDraftPoints((currentPoints) => [
            ...currentPoints,
            {
              id: makeId("point"),
              ...point,
            },
          ]);
        }}
        onMouseMove={(event) => {
          const pointer = event.target.getStage()?.getPointerPosition();

          if (!pointer) {
            return;
          }

          if (activeTool === "draw" && !isPanning) {
            setDraftCursor(screenToPatternPoint(pointer));
          }

          if (!isPanning || !lastPointerPosition) {
            return;
          }

          const deltaX = pointer.x - lastPointerPosition.x;
          const deltaY = pointer.y - lastPointerPosition.y;

          setCamera((currentCamera) => ({
            ...currentCamera,
            x: currentCamera.x + deltaX,
            y: currentCamera.y + deltaY,
          }));

          setLastPointerPosition(pointer);
        }}
        onMouseUp={() => {
          setIsPanning(false);
          setLastPointerPosition(null);
        }}
        onMouseLeave={() => {
          setIsPanning(false);
          setLastPointerPosition(null);
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

                  const directionLength = Math.hypot(
                    direction.x,
                    direction.y,
                  );

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
                      setSelectedPieceId(piece.id);
                    }
                  }}
                  onTap={() => {
                    if (activeTool === "select") {
                      setSelectedPieceId(piece.id);
                    }
                  }}
                  onDragStart={() => {
                    setSelectedPieceId(piece.id);
                  }}
                  onDragMove={(event) => {
                    if (event.target !== event.currentTarget) {
                      return;
                    }

                    updatePiecePosition(
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

                    updatePiecePosition(piece.id, x, y);

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

                        const pointer = event.target
                          .getStage()
                          ?.getPointerPosition();

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

                        insertPatternPoint(piece.id, edge.start.id, newPoint);
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

                      // These stay a readable screen size while zooming.
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
                        onDragMove={(event) => {
                          event.cancelBubble = true;

                          const position = event.target.position();
                          const x = snapToGrid(position.x);
                          const y = snapToGrid(position.y);

                          updatePatternPoint(piece.id, point.id, x, y);
                          event.target.position({ x, y });
                        }}
                        onDragEnd={(event) => {
                          event.cancelBubble = true;

                          const position = event.target.position();
                          const x = snapToGrid(position.x);
                          const y = snapToGrid(position.y);

                          updatePatternPoint(piece.id, point.id, x, y);
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
            text="Select: drag empty space to pan • Drag nodes to reshape • Double-click edge to add point"
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
    </div>
  );
}

export default App;

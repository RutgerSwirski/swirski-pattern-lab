import { Layer, Line } from "react-konva";

import { GRID_SIZE_MM, MM_TO_PX } from "../lib/patternConfig";
import type { Camera, Viewport } from "../types";

type GridLayerProps = {
  camera: Camera;
  viewport: Viewport;
};

function getGridOffset(position: number, spacing: number) {
  return ((position % spacing) + spacing) % spacing;
}

export function GridLayer({ camera, viewport }: GridLayerProps) {
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
    <Layer listening={false}>
      {minorGridLines}
      {majorGridLines}
    </Layer>
  );
}

import { Layer, Text } from "react-konva";

import { GRID_SIZE_MM } from "../lib/patternConfig";
import type { Camera, Viewport } from "../types";

type CanvasHudProps = {
  camera: Camera;
  viewport: Viewport;
};

export function CanvasHud({ camera, viewport }: CanvasHudProps) {
  return (
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
        text="Select: drag empty space to pan • Drag nodes to reshape • Double-click edge for curve handles • Alt+double-click edge to add point"
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
  );
}

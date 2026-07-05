import type { PieceTool } from "../types";

type PieceToolBarProps = {
  activeTool: PieceTool;
  onSelectTool: (tool: PieceTool) => void;
};

const PIECE_TOOLS: Array<{ id: PieceTool; label: string }> = [
  { id: "move", label: "Move" },
  { id: "add-point", label: "Add point" },
  { id: "curve", label: "Curve" },
];

export function PieceToolBar({
  activeTool,
  onSelectTool,
}: PieceToolBarProps) {
  return (
    <div className="piece-toolbar" aria-label="Piece tools">
      {PIECE_TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          aria-pressed={activeTool === tool.id}
          className={activeTool === tool.id ? "active" : ""}
          onClick={() => onSelectTool(tool.id)}
        >
          {tool.label}
        </button>
      ))}
    </div>
  );
}

import type { PieceTool } from "../types";

type PieceToolBarProps = {
  activeTool: PieceTool;
  canCreateSymmetry: boolean;
  onCreateSymmetry: () => void;
  onSelectTool: (tool: PieceTool) => void;
};

const PIECE_TOOLS: Array<{ id: PieceTool; label: string }> = [
  { id: "move", label: "Move" },
  { id: "add-point", label: "Add point" },
  { id: "curve", label: "Curve" },
];

export function PieceToolBar({
  activeTool,
  canCreateSymmetry,
  onCreateSymmetry,
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

      <span className="piece-toolbar__divider" aria-hidden="true" />

      <button
        type="button"
        onClick={onCreateSymmetry}
        disabled={!canCreateSymmetry}
      >
        Mirror
      </button>
    </div>
  );
}

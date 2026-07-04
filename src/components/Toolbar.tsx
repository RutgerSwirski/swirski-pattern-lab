import type { Tool } from "../types";

type ToolbarProps = {
  activeTool: Tool;
  canCreateSymmetry: boolean;
  draftPointCount: number;
  onCancelDraft: () => void;
  onCreateSymmetry: () => void;
  onFinishDraft: () => void;
  onSelectTool: (tool: Tool) => void;
};

export function Toolbar({
  activeTool,
  canCreateSymmetry,
  draftPointCount,
  onCancelDraft,
  onCreateSymmetry,
  onFinishDraft,
  onSelectTool,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <button
        className={activeTool === "select" ? "active" : ""}
        onClick={() => onSelectTool("select")}
      >
        Select
      </button>

      <button
        className={activeTool === "draw" ? "active" : ""}
        onClick={() => onSelectTool("draw")}
      >
        Draw Piece
      </button>

      <button onClick={onCreateSymmetry} disabled={!canCreateSymmetry}>
        Mirror
      </button>

      {activeTool === "draw" && (
        <>
          <button onClick={onFinishDraft} disabled={draftPointCount < 3}>
            Finish
          </button>

          <button onClick={onCancelDraft}>Cancel</button>
        </>
      )}
    </div>
  );
}

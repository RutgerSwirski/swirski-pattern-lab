import type { Tool } from "../types";

type ToolbarProps = {
  activeTool: Tool;
  draftPointCount: number;
  onCancelDraft: () => void;
  onFinishDraft: () => void;
  onSelectTool: (tool: Tool) => void;
};

export function Toolbar({
  activeTool,
  draftPointCount,
  onCancelDraft,
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

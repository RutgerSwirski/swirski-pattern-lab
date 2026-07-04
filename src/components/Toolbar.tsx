import type { Tool } from "../types";

type ToolbarProps = {
  activeTool: Tool;
  canRedo: boolean;
  canCreateSymmetry: boolean;
  canUndo: boolean;
  draftPointCount: number;
  onCancelDraft: () => void;
  onCreateSymmetry: () => void;
  onRedo: () => void;
  onFinishDraft: () => void;
  onSelectTool: (tool: Tool) => void;
  onUndo: () => void;
};

export function Toolbar({
  activeTool,
  canRedo,
  canCreateSymmetry,
  canUndo,
  draftPointCount,
  onCancelDraft,
  onCreateSymmetry,
  onRedo,
  onFinishDraft,
  onSelectTool,
  onUndo,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <button onClick={onUndo} disabled={!canUndo}>
        Undo
      </button>

      <button onClick={onRedo} disabled={!canRedo}>
        Redo
      </button>

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

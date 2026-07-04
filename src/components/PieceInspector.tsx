import { getNumericInputValue, getPiecePerimeter } from "../lib/geometry";
import type { PatternPiece, PieceMetadata } from "../types";

type PieceInspectorProps = {
  piece: PatternPiece;
  onClose: () => void;
  onUpdateMetadata: (pieceId: string, metadata: PieceMetadata) => void;
};

export function PieceInspector({
  piece,
  onClose,
  onUpdateMetadata,
}: PieceInspectorProps) {
  return (
    <aside className="piece-inspector" aria-label="Selected piece metadata">
      <div className="piece-inspector__header">
        <div>
          <p className="piece-inspector__eyebrow">Selected piece</p>
          <h2>{piece.name}</h2>
        </div>

        <button
          type="button"
          className="piece-inspector__close"
          onClick={onClose}
          aria-label="Close selected piece metadata"
        >
          x
        </button>
      </div>

      <label className="field">
        <span>Name</span>
        <input
          value={piece.name}
          onChange={(event) =>
            onUpdateMetadata(piece.id, {
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
            value={piece.lengthMm}
            onChange={(event) =>
              onUpdateMetadata(piece.id, {
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
            value={piece.cornerRadiusMm}
            onChange={(event) =>
              onUpdateMetadata(piece.id, {
                cornerRadiusMm: getNumericInputValue(event.target.value, 0),
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
            value={piece.quantity}
            onChange={(event) =>
              onUpdateMetadata(piece.id, {
                quantity: getNumericInputValue(event.target.value, 1),
              })
            }
          />
        </label>

        <div className="metric">
          <span>Perimeter</span>
          <strong>{Math.round(getPiecePerimeter(piece.points))} mm</strong>
        </div>
      </div>

      <label className="field">
        <span>Notes</span>
        <textarea
          rows={3}
          value={piece.notes}
          onChange={(event) =>
            onUpdateMetadata(piece.id, {
              notes: event.target.value,
            })
          }
        />
      </label>
    </aside>
  );
}

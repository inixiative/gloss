export const SyncBurst = () => (
  <svg viewBox="0 0 48 48">
    {/* Salesforce mark, drawn as a single path so the whole glyph strokes on as one unit */}
    <path className="mark" d="M12 24h24" />
    {/* outer pulse ring */}
    <circle className="pulse" r="18" />
    {/* inner pulse ring, half a beat behind */}
    <circle className="pulse" r="18" />
  </svg>
);

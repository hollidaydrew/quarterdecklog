export default function TagChip({ tag, onClick, active = true, outline = false }) {
  if (outline) {
    return (
      <button type="button" className={`tag-chip outline${active ? ' active' : ''}`} onClick={onClick} style={active ? { borderColor: tag.color, color: tag.color } : undefined}>
        <span className="dot" style={{ background: tag.color }} />
        {tag.name}
      </button>
    );
  }
  return (
    <span className="tag-chip" style={{ background: tag.color }} onClick={onClick}>
      {tag.name}
    </span>
  );
}

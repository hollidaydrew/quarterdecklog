export default function Modal({ children, onClose }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">{children}</div>
    </div>
  );
}

// Inline feedback line. Renders nothing without content, so pages can write
// <Alert type={message?.type}>{message?.text}</Alert> unconditionally.
// Uses the shared error-text / success-text / info-text classes from globals.css.
const CLASS_BY_TYPE = {
  error: 'error-text',
  success: 'success-text',
  info: 'info-text',
};

const Alert = ({ type = 'error', children }) => {
  if (!children) return null;
  return (
    <p
      role={type === 'error' ? 'alert' : 'status'}
      className={CLASS_BY_TYPE[type] ?? 'success-text'}
    >
      {children}
    </p>
  );
};

export default Alert;

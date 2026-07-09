// Inline feedback line. Renders nothing without content, so pages can write
// <Alert type={message?.type}>{message?.text}</Alert> unconditionally.
// Uses the shared error-text / success-text classes from globals.css.
const Alert = ({ type = 'error', children }) => {
  if (!children) return null;
  return (
    <p
      role={type === 'error' ? 'alert' : 'status'}
      className={type === 'error' ? 'error-text' : 'success-text'}
    >
      {children}
    </p>
  );
};

export default Alert;

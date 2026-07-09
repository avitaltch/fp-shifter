import { Loader2 } from 'lucide-react';
import './LoadingSpinner.css';

const LoadingSpinner = ({ text = 'טוען...', fullScreen = false, inline = false }) => {
  let containerClass = 'loading-spinner-container';
  if (fullScreen) containerClass += ' full-screen';
  if (inline) containerClass += ' inline';

  return (
    <div className={containerClass}>
      <Loader2 className="spinner-icon" size={inline ? 18 : 32} />
      {text && <span className="spinner-text">{text}</span>}
    </div>
  );
};

export default LoadingSpinner;

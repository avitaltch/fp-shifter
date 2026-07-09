import './PageContainer.css';

const PageContainer = ({ children, size = 'md', className = '' }) => {
  // size can be 'sm' (500px), 'md' (800px), 'lg' (1200px)
  return (
    <div className={`page-wrapper fade-in ${className}`}>
      <div className={`page-container size-${size}`}>
        {children}
      </div>
    </div>
  );
};

export default PageContainer;

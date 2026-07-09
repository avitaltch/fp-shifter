import './PageHeader.css';

// The icon + title + subtitle header every page repeats. Owns its CSS —
// previously .page-header was styled in one page's stylesheet and leaked
// globally to all the others.
const PageHeader = ({ icon: Icon, title, subtitle }) => (
  <header className="page-header">
    {Icon && <Icon size={32} className="header-icon" />}
    <h1>{title}</h1>
    {subtitle && <p>{subtitle}</p>}
  </header>
);

export default PageHeader;

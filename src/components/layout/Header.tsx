interface HeaderProps {
  onManualClick?: () => void;
}

export function Header({ onManualClick }: HeaderProps) {
  return (
    <header className="header">
      <h1>WSDL-to-MCP</h1>
      <p>
        Generate MCP servers from SOAP web service definitions
        {onManualClick && (
          <>
            {' — '}
            <button className="btn-text header-manual-link" onClick={onManualClick}>
              User Manual
            </button>
          </>
        )}
        {' — '}
        <a
          href="https://github.com/higeshogun/wsdl-to-mcp"
          target="_blank"
          rel="noopener noreferrer"
          className="header-manual-link"
        >
          GitHub
        </a>
      </p>
    </header>
  );
}

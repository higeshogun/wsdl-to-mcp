import { useEffect, useRef } from 'react';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import 'highlight.js/styles/github-dark.css';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('json', json);

interface CodePreviewProps {
  code: string;
  language?: string;
  fileName?: string;
}

export function CodePreview({ code, language = 'typescript', fileName }: CodePreviewProps) {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.textContent = code;
      hljs.highlightElement(codeRef.current);
    }
  }, [code, language]);

  return (
    <div className="code-preview">
      {fileName && <div className="code-preview-header">{fileName}</div>}
      <pre>
        <code ref={codeRef} className={`language-${language}`}>
          {code}
        </code>
      </pre>
    </div>
  );
}

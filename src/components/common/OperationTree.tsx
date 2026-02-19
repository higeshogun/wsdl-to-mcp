import type { WsdlDefinition } from '../../types/wsdl-types';
import { useState } from 'react';

interface OperationTreeProps {
  definitions: WsdlDefinition[];
  toolPrefix: string;
  onSelectOperation?: (serviceName: string, operationName: string) => void;
}

export function OperationTree({ definitions, toolPrefix, onSelectOperation }: OperationTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (definitions.length === 0) {
    return <p className="muted">No services discovered yet.</p>;
  }

  return (
    <div className="operation-tree">
      {definitions.map(wsdl =>
        wsdl.portTypes.map(pt => (
          <div key={pt.name} className="tree-node">
            <button
              className="tree-toggle"
              onClick={() => toggle(pt.name)}
            >
              {expanded.has(pt.name) ? '\u25BC' : '\u25B6'} {pt.name}
              <span className="badge">{pt.operations.length} ops</span>
            </button>
            {expanded.has(pt.name) && (
              <ul className="tree-children">
                {pt.operations.map(op => {
                  const toolName = `${toolPrefix}_${toSnakeCase(op.name)}`;
                  return (
                    <li
                      key={op.name}
                      className="tree-leaf"
                      onClick={() => onSelectOperation?.(pt.name, op.name)}
                    >
                      <code>{toolName}</code>
                      {op.documentation && (
                        <span className="tree-doc">{op.documentation}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )),
      )}
    </div>
  );
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

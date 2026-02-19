import { useCallback, useState, type DragEvent } from 'react';

interface FileDropZoneProps {
  onFilesAdded: (files: { name: string; content: string }[]) => void;
}

export function FileDropZone({ onFilesAdded }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const items = Array.from(e.dataTransfer.files);
      const validFiles = items.filter(
        f => f.name.endsWith('.wsdl') || f.name.endsWith('.xsd'),
      );

      if (validFiles.length === 0) return;

      const results: { name: string; content: string }[] = [];
      for (const file of validFiles) {
        const content = await file.text();
        results.push({ name: file.name, content });
      }

      onFilesAdded(results);
    },
    [onFilesAdded],
  );

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      const results: { name: string; content: string }[] = [];
      for (const file of Array.from(files)) {
        const content = await file.text();
        results.push({ name: file.name, content });
      }

      onFilesAdded(results);
      e.target.value = '';
    },
    [onFilesAdded],
  );

  return (
    <div
      className={`drop-zone ${isDragging ? 'dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className="drop-zone-content">
        <p className="drop-zone-icon">+</p>
        <p>Drag and drop .wsdl and .xsd files here</p>
        <p className="drop-zone-or">or</p>
        <label className="drop-zone-browse">
          Browse files
          <input
            type="file"
            multiple
            accept=".wsdl,.xsd"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
        </label>
      </div>
    </div>
  );
}

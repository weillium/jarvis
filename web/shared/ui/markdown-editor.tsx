'use client';

import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  height?: number;
  disabled?: boolean;
  label?: string;
  instructions?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  height = 200,
  disabled = false,
  label,
  instructions,
}: MarkdownEditorProps) {
  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151',
            marginBottom: '8px',
          }}
        >
          {label}
        </label>
      )}
      {instructions && (
        <p
          style={{
            fontSize: '12px',
            color: '#64748b',
            margin: '0 0 12px 0',
            fontStyle: 'italic',
          }}
        >
          {instructions}
        </p>
      )}
      <div
        data-color-mode="light"
        style={{
          borderRadius: '6px',
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
        }}
      >
        <MDEditor
          value={value}
          onChange={(newValue) => onChange(newValue || '')}
          preview="edit"
          hideToolbar={false}
          visibleDragbar={false}
          height={height}
        />
      </div>
    </div>
  );
}


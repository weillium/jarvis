'use client';

import { useRef, useState } from 'react';

interface FileUploadProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  label?: string;
  instructions?: string;
  multiple?: boolean;
  disabled?: boolean;
  acceptedFileTypes?: string;
}

interface FileItemProps {
  file: File;
  onRemove: () => void;
  disabled?: boolean;
}

function FileItem({ file, onRemove, disabled }: FileItemProps) {
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '6px',
        fontSize: '14px',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: '500',
            color: '#1e293b',
            marginBottom: '4px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {file.name}
        </div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          {formatFileSize(file.size)}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        disabled={disabled}
        style={{
          marginLeft: '12px',
          padding: '6px 12px',
          background: '#fee2e2',
          border: 'none',
          borderRadius: '6px',
          color: '#991b1b',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '13px',
          fontWeight: '500',
          transition: 'background 0.2s',
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.background = '#fecaca';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#fee2e2';
        }}
      >
        Remove
      </button>
    </div>
  );
}

export function FileUpload({
  files,
  onFilesChange,
  label,
  instructions,
  multiple = true,
  disabled = false,
  acceptedFileTypes,
}: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (newFiles: File[]) => {
    if (multiple) {
      onFilesChange([...files, ...newFiles]);
    } else {
      onFilesChange(newFiles);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      handleFileChange(newFiles);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

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
          }}
        >
          {instructions}
        </p>
      )}

      {files.length === 0 && (
        <div
          style={{
            border: `2px dashed ${isDragging ? '#1e293b' : '#e2e8f0'}`,
            borderRadius: '8px',
            padding: '24px',
            textAlign: 'center',
            background: disabled ? '#f8fafc' : isDragging ? '#f8fafc' : '#ffffff',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => {
            if (!disabled && fileInputRef.current) {
              fileInputRef.current.click();
            }
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple={multiple}
            onChange={(e) => {
              if (e.target.files) {
                handleFileChange(Array.from(e.target.files));
              }
              // Reset input so same file can be selected again
              e.target.value = '';
            }}
            disabled={disabled}
            accept={acceptedFileTypes}
            style={{ display: 'none' }}
          />
          <div style={{ color: '#64748b', fontSize: '14px' }}>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ margin: '0 auto 12px', display: 'block' }}
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <div style={{ marginBottom: '4px' }}>
              <strong style={{ color: '#1e293b' }}>Click to upload</strong> or drag and drop
            </div>
            <div style={{ fontSize: '12px' }}>
              Multiple files supported
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple={multiple}
        onChange={(e) => {
          if (e.target.files) {
            handleFileChange(Array.from(e.target.files));
          }
          // Reset input so same file can be selected again
          e.target.value = '';
        }}
        disabled={disabled}
        accept={acceptedFileTypes}
        style={{ display: 'none' }}
      />

      {files.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '12px' }}>
            Selected Files ({files.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {files.map((file, index) => (
              <FileItem
                key={`${file.name}-${index}-${file.size}`}
                file={file}
                onRemove={() => {
                  const newFiles = files.filter((_, i) => i !== index);
                  onFilesChange(newFiles);
                }}
                disabled={disabled}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => {
                if (!disabled && fileInputRef.current) {
                  fileInputRef.current.click();
                }
              }}
              disabled={disabled}
              style={{
                padding: '8px 16px',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                color: '#374151',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!disabled) {
                  e.currentTarget.style.background = '#f8fafc';
                  e.currentTarget.style.borderColor = '#cbd5e1';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#ffffff';
                e.currentTarget.style.borderColor = '#e2e8f0';
              }}
            >
              Add more files
            </button>
            <button
              type="button"
              onClick={() => {
                onFilesChange([]);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
              disabled={disabled}
              style={{
                padding: '8px 16px',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                color: '#64748b',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!disabled) {
                  e.currentTarget.style.background = '#f8fafc';
                  e.currentTarget.style.borderColor = '#cbd5e1';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#ffffff';
                e.currentTarget.style.borderColor = '#e2e8f0';
              }}
            >
              Clear All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


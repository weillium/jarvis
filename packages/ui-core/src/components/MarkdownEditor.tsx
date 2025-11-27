'use client';

import '@uiw/react-md-editor/markdown-editor.css';
import MDEditor from '@uiw/react-md-editor';
import { YStack } from 'tamagui';
import { Label, Caption } from './Typography';
import { Card } from './Card';

export interface MarkdownEditorProps {
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
    <YStack width="100%">
      {label ? <Label>{label}</Label> : null}
      {instructions ? (
        <Caption marginBottom="$2" fontStyle="italic">
          {instructions}
        </Caption>
      ) : null}

      <Card data-color-mode="light" padding={0} borderRadius="$3" borderWidth={1}>
        <MDEditor
          value={value}
          onChange={(next) => onChange(next || '')}
          preview="edit"
          hideToolbar={false}
          visibleDragbar={false}
          height={height}
          textareaProps={{
            placeholder,
            disabled,
          }}
        />
      </Card>
    </YStack>
  );
}


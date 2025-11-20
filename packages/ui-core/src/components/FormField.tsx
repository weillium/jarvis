'use client';

import type { ReactNode } from 'react';
import { YStack, type StackProps } from 'tamagui';
import { Label, Body, Caption } from './Typography';

export interface FormFieldProps extends StackProps {
  label?: string;
  htmlFor?: string;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
}

export function FormField({
  label,
  htmlFor,
  description,
  error,
  required = false,
  children,
  ...stackProps
}: FormFieldProps) {
  return (
    <YStack gap="$3" width="100%" {...stackProps}>
      {label ? (
        <Label htmlFor={htmlFor}>
          {label}
          {required ? ' *' : null}
        </Label>
      ) : null}
      {description ? (
        typeof description === 'string' ? (
          <Caption>
            {description}
          </Caption>
        ) : (
          description
        )
      ) : null}
      {children}
      {error ? (
        typeof error === 'string' ? (
          <Caption tone="danger">
            {error}
          </Caption>
        ) : (
          error
        )
      ) : null}
    </YStack>
  );
}


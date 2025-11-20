'use client';

import type { ReactNode } from 'react';
import { YStack, type StackProps } from 'tamagui';
import { Label, Caption } from './Typography';

export interface FormFieldProps extends Omit<StackProps, 'inset'> {
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
    <YStack gap="$3" width="100%" {...(stackProps as any)}>
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


'use client';

import type { ReactNode } from 'react';
import { YStack, type StackProps } from 'tamagui';
import { Heading, Body } from './Typography';
import { ButtonGroup } from './ButtonGroup';

export interface ModalContentProps extends StackProps {
  title?: string;
  description?: ReactNode;
  icon?: ReactNode;
  footer?: ReactNode;
  actions?: ReactNode;
  spacing?: StackProps['gap'];
  align?: 'start' | 'center';
  children?: ReactNode;
}

export function ModalContent({
  title,
  description,
  icon,
  footer,
  actions,
  spacing = '$4',
  align = 'start',
  children,
  ...stackProps
}: ModalContentProps) {
  const alignment = align === 'center' ? 'center' : 'flex-start';

  return (
    <YStack gap={spacing} alignItems={alignment} {...stackProps}>
      {(icon || title || description) && (
        <YStack gap="$2" alignItems={alignment} width="100%">
          {icon ? <YStack>{icon}</YStack> : null}
          {title ? (
            <Heading level={3} textAlign={align}>
              {title}
            </Heading>
          ) : null}
          {description ? (
            typeof description === 'string' ? (
              <Body tone="muted" textAlign={align}>
                {description}
              </Body>
            ) : (
              description
            )
          ) : null}
        </YStack>
      )}

      {children ? <YStack width="100%">{children}</YStack> : null}

      {footer ? <YStack width="100%">{footer}</YStack> : null}

      {actions ? (
        <ButtonGroup width="100%" orientation="horizontal" align="end">
          {actions}
        </ButtonGroup>
      ) : null}
    </YStack>
  );
}


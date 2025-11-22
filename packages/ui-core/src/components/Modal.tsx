'use client';

import type { ReactNode } from 'react';
import { Dialog, styled, YStack, XStack, VisuallyHidden } from 'tamagui';
import type { DialogProps } from 'tamagui';
import { Button } from './Button';
import { Heading, Body } from './Typography';

export interface ModalProps extends Omit<DialogProps, 'open' | 'onOpenChange' | 'children'> {
  isOpen: boolean;
  onClose: () => void;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  showCloseButton?: boolean;
  maxWidth?: number | string;
  children?: React.ReactNode;
  description?: React.ReactNode;
  trigger?: ReactNode;
}

const DialogContent = styled(Dialog.Content, {
  name: 'ModalContent',
  backgroundColor: '$background',
  borderRadius: '$4',
  padding: 0,
  maxHeight: '90vh',
  overflow: 'visible',
  shadowColor: '$color',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.15,
  shadowRadius: 12,
  elevation: 8,
  width: '100%',
  pointerEvents: 'auto',
  // Ensure content is positioned within its stacking context
  position: 'relative',
  zIndex: 1,
});

const DialogOverlay = styled(Dialog.Overlay, {
  name: 'ModalOverlay',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  animation: 'quick',
  enterStyle: { opacity: 0 },
  exitStyle: { opacity: 0 },
  zIndex: 1000,
  // Ensure overlay creates proper stacking context
  position: 'fixed',
  inset: 0,
});

const DialogContainer = styled(YStack, {
  name: 'ModalContainer',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'fixed',
  inset: 0,
  padding: '$4',
  pointerEvents: 'none',
  zIndex: 1001,
  // Removed isolation: isolate to allow Select dropdowns to appear above Modal
  // isolation: 'isolate' was preventing Select dropdowns from appearing above even with higher z-index
});

export function Modal({
  isOpen,
  onClose,
  onOpenChange,
  title,
  description,
  showCloseButton = true,
  maxWidth = 1200,
  trigger,
  children,
  ...dialogProps
}: ModalProps) {
  return (
    <Dialog
      modal
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange?.(open);
        if (!open) {
          onClose();
        }
      }}
      // Disable FocusScope to prevent conflicts with Select's FocusScope
      // This prevents infinite focus loops when Select is inside Modal
      disableFocusScope={true}
      {...dialogProps}
    >
      {trigger ? (
        <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      ) : null}
      <Dialog.Portal>
        <DialogOverlay
          key="overlay"
          animation="quick"
          opacity={0.5}
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />
        <DialogContainer>
          <DialogContent
            key="content"
            maxWidth={maxWidth}
            animation="quick"
            enterStyle={{ opacity: 0, scale: 0.95, y: -10 }}
            exitStyle={{ opacity: 0, scale: 0.95, y: -10 }}
          >
            {!title && (
              <VisuallyHidden>
                <Dialog.Title>Modal</Dialog.Title>
              </VisuallyHidden>
            )}
            {(title || description || showCloseButton) && (
              <XStack
                padding="$6"
                borderBottomWidth={1}
                borderBottomColor="$borderColor"
                justifyContent="space-between"
                alignItems="center"
              >
                <YStack flex={1} minWidth={0} marginRight="$4">
                  {title ? (
                    <Dialog.Title>
                      <Heading level={3} margin={0}>
                        {title}
                      </Heading>
                    </Dialog.Title>
                  ) : null}
                  {description ? (
                    <Body tone="muted" size="sm" marginTop="$2">
                      {description}
                    </Body>
                  ) : null}
                </YStack>
                {showCloseButton && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    circular
                    width={32}
                    height={32}
                    padding={0}
                  >
                    ×
                  </Button>
                )}
              </XStack>
            )}
            <YStack padding="$6" gap="$4" maxHeight="calc(90vh - 100px)" overflow="scroll">
              {children}
            </YStack>
          </DialogContent>
        </DialogContainer>
      </Dialog.Portal>
    </Dialog>
  );
}

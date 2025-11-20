'use client';

import { Dialog, styled, YStack, XStack } from 'tamagui';
import type { DialogProps } from 'tamagui';
import { Button } from './Button';
import { Heading, Body } from './Typography';

export interface ModalProps extends Omit<DialogProps, 'open' | 'onOpenChange'> {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  showCloseButton?: boolean;
  maxWidth?: number | string;
  children: React.ReactNode;
  description?: React.ReactNode;
}

const DialogContent = styled(Dialog.Content, {
  name: 'ModalContent',
  backgroundColor: '$background',
  borderRadius: '$4',
  padding: 0,
  maxHeight: '90vh',
  overflow: 'hidden',
  shadowColor: '$color',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.15,
  shadowRadius: 12,
  elevation: 8,
});

const DialogOverlay = styled(Dialog.Overlay, {
  name: 'ModalOverlay',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  animation: 'quick',
  enterStyle: { opacity: 0 },
  exitStyle: { opacity: 0 },
  zIndex: 1000,
});

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  showCloseButton = true,
  maxWidth = 1200,
  children,
  ...dialogProps
}: ModalProps) {
  // Don't render the Dialog at all when closed to prevent it from always showing
  if (!isOpen) {
    return null;
  }

  return (
    <Dialog
      modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      {...dialogProps}
    >
      <DialogOverlay
        key="overlay"
        animation="quick"
        opacity={0.5}
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
      />
      <DialogContent
        key="content"
        maxWidth={maxWidth}
        width="95vw"
        alignSelf="center"
        marginVertical="auto"
        animation="quick"
        enterStyle={{ opacity: 0, scale: 0.95, y: -10 }}
        exitStyle={{ opacity: 0, scale: 0.95, y: -10 }}
      >
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
                <Heading level={3} margin={0}>
                  {title}
                </Heading>
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
    </Dialog>
  );
}

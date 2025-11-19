'use client';

import { Dialog, styled, YStack, XStack, Text } from 'tamagui';
import type { DialogProps } from 'tamagui';
import { Button } from './Button';

export interface ModalProps extends Omit<DialogProps, 'open' | 'onOpenChange'> {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  showCloseButton?: boolean;
  maxWidth?: number | string;
  children: React.ReactNode;
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
  showCloseButton = true,
  maxWidth = 1200,
  children,
  ...dialogProps
}: ModalProps) {
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
        {(title || showCloseButton) && (
          <XStack
            padding="$6"
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
            justifyContent="space-between"
            alignItems="center"
          >
            {title && (
              <Text fontSize="$7" fontWeight="600" color="$color" margin={0}>
                {title}
              </Text>
            )}
            {showCloseButton && (
              <Button
                variant="ghost"
                size="sm"
                onPress={onClose}
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
        <YStack padding="$6" gap="$4" maxHeight="calc(90vh - 100px)" overflowY="auto">
          {children}
        </YStack>
      </DialogContent>
    </Dialog>
  );
}


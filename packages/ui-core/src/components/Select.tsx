'use client';

import { forwardRef, useMemo, ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Select as TamaguiSelect, styled } from 'tamagui';
import type { SelectProps as TamaguiSelectProps } from 'tamagui';

export interface SelectProps extends Omit<TamaguiSelectProps, 'size' | 'children'> {
  size?: 'sm' | 'md';
  children?: ReactNode;
  value?: string;
  defaultValue?: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  onValueChange?: (value: string) => void;
}

const StyledSelectRoot = styled(TamaguiSelect, {
  name: 'Select',
  width: '100%',
  minWidth: 0,
  flexBasis: 0,
  flexGrow: 1,
  flexShrink: 1,
});

const StyledSelectTrigger = styled(TamaguiSelect.Trigger, {
  name: 'SelectTrigger',
  fontFamily: '$body',
  borderRadius: '$3',
  borderWidth: 1,
  borderColor: '$borderColor',
  backgroundColor: '$background',
  color: '$color',
  paddingHorizontal: '$4',
  paddingVertical: '$0.5',
  fontSize: '$4',
  width: '100%',
  // minHeight calculated: fontSize 14px * 1.4 lineHeight = 20px + paddingVertical $0.5*2 (4px) = 24px
  minHeight: 24,
  cursor: 'pointer',
  focusStyle: {
    borderColor: '$blue6',
    outlineWidth: 0,
  },
  hoverStyle: {
    borderColor: '$borderColorHover',
  },
  disabledStyle: {
    backgroundColor: '$backgroundHover',
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  variants: {
    size: {
      sm: {
        paddingHorizontal: '$3',
        paddingVertical: '$0.5',
        fontSize: '$3',
        // minHeight calculated: fontSize 13px * 1.4 lineHeight = 19px + paddingVertical $0.5*2 (4px) = 23px
        minHeight: 23,
      },
      md: {
        paddingHorizontal: '$4',
        paddingVertical: '$0.5',
        fontSize: '$4',
        // minHeight calculated: fontSize 14px * 1.4 lineHeight = 20px + paddingVertical $0.5*2 (4px) = 24px
        minHeight: 24,
      },
    },
  } as const,
  defaultVariants: {
    size: 'md',
  },
});

const StyledSelectContent = styled(TamaguiSelect.Content, {
  name: 'SelectContent',
  borderRadius: '$3',
  borderWidth: 1,
  borderColor: '$borderColor',
  backgroundColor: '$background',
  padding: '$2',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  // Very high z-index to appear above modals (Modal container is 1001)
  // Using a much higher value to ensure it's above any modal stacking context
  zIndex: 10000,
  // Absolute positioning - Tamagui handles the positioning relative to trigger
  position: 'absolute',
});

const StyledSelectItem = styled(TamaguiSelect.Item, {
  name: 'SelectItem',
  borderRadius: '$2',
  paddingHorizontal: '$3',
  paddingVertical: '$2',
  cursor: 'pointer',
  focusStyle: {
    backgroundColor: '$backgroundHover',
    outlineWidth: 0,
  },
});

const StyledSelectViewport = styled(TamaguiSelect.Viewport, {
  name: 'SelectViewport',
  padding: '$1',
});

// Wrapper to ensure proper z-index stacking when portaled
// This creates a stacking context that appears above modals
const SelectPortalContent = styled('div', {
  name: 'SelectPortalContent',
  zIndex: 10000,
  position: 'relative',
  // Ensure this creates a new stacking context above everything
  isolation: 'isolate',
  // Use important to override any inherited styles
  // Note: Tamagui styled doesn't support !important directly, so we'll use inline styles
});

// Helper to safely convert children to string
function childrenToString(children: unknown): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) {
    return children.map(childrenToString).join('');
  }
  if (children && typeof children === 'object') {
    // Handle React elements and other objects
    if ('props' in children && typeof children.props === 'object' && children.props !== null) {
      const props = children.props as { children?: unknown };
      if (props.children) {
        return childrenToString(props.children);
      }
    }
  }
  return '';
}

// Convert native option elements to Tamagui Select.Items
function convertOptionsToItems(children: ReactNode): ReactNode {
  if (!children) return null;
  
  if (Array.isArray(children)) {
    const items: ReactNode[] = [];
    children.forEach((child, index) => {
      if (
        typeof child === 'object' &&
        child !== null &&
        'type' in child &&
        (child as { type: unknown }).type === 'option'
      ) {
        const option = child as React.ReactElement<HTMLOptionElement>;
        const value = option.props.value || childrenToString(option.props.children) || '';
        const label = childrenToString(option.props.children) || value;
        
        items.push(
          <StyledSelectItem key={value || index} value={value} index={index}>
            <TamaguiSelect.ItemText>{label}</TamaguiSelect.ItemText>
          </StyledSelectItem>
        );
      } else {
        items.push(child as ReactNode);
      }
    });
    return items;
  }
  
  if (
    typeof children === 'object' &&
    children !== null &&
    'type' in children &&
    (children as { type: unknown }).type === 'option'
  ) {
    const option = children as React.ReactElement<HTMLOptionElement>;
    const value = option.props.value || childrenToString(option.props.children) || '';
    const label = childrenToString(option.props.children) || value;
    
    return (
      <StyledSelectItem value={value} index={0}>
        <TamaguiSelect.ItemText>{label}</TamaguiSelect.ItemText>
      </StyledSelectItem>
    );
  }
  
  return children;
}

// Create a dedicated container for Select dropdowns that renders after all Modals
function getSelectPortalContainer(): HTMLElement {
  let container = document.getElementById('select-dropdown-portal-root');
  if (!container) {
    container = document.createElement('div');
    container.id = 'select-dropdown-portal-root';
    // Use inline styles with !important to ensure z-index is applied
    container.style.cssText = `
      z-index: 10000 !important;
      position: relative !important;
      isolation: isolate !important;
    `;
    // Find PortalProvider's root host and append after it, or append to end of body
    const portalRootHost = document.querySelector('[data-tamagui-portal-host]') || 
                          document.querySelector('[data-portal-host]') ||
                          document.body;
    portalRootHost.appendChild(container);
  }
  return container;
}

export const Select = forwardRef<any, SelectProps>(function Select(props, _ref) {
  const { size, children, value, defaultValue, onChange, onValueChange, ...rest } = props;
  const sizeProp = size || 'md';
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  
  // Get or create portal container on mount
  useEffect(() => {
    if (typeof document !== 'undefined') {
      setPortalContainer(getSelectPortalContainer());
    }
  }, []);
  
  // Convert native option elements to Tamagui Select.Items
  const items = useMemo(() => convertOptionsToItems(children), [children]);
  
  // Handle value changes
  const handleValueChange = (newValue: string) => {
    if (onValueChange) {
      onValueChange(newValue);
    }
    if (onChange) {
      // Create a synthetic event for onChange compatibility
      const syntheticEvent = {
        target: { value: newValue },
        currentTarget: { value: newValue },
      } as React.ChangeEvent<HTMLSelectElement>;
      onChange(syntheticEvent);
    }
  };
  
  return (
    <StyledSelectRoot
      value={value}
      defaultValue={defaultValue}
      onValueChange={handleValueChange}
      {...rest}
    >
      <StyledSelectTrigger size={sizeProp}>
        <TamaguiSelect.Value placeholder="Select..." />
        <TamaguiSelect.Icon />
      </StyledSelectTrigger>
      <TamaguiSelect.Adapt when="sm" platform="touch">
        <TamaguiSelect.Sheet modal dismissOnSnapToBottom>
          <TamaguiSelect.Sheet.Frame>
            <TamaguiSelect.Sheet.ScrollView>
              <TamaguiSelect.Adapt.Contents />
            </TamaguiSelect.Sheet.ScrollView>
          </TamaguiSelect.Sheet.Frame>
          <TamaguiSelect.Sheet.Overlay />
        </TamaguiSelect.Sheet>
      </TamaguiSelect.Adapt>
      {portalContainer &&
        createPortal(
          <SelectPortalContent
            style={{ zIndex: 10000, position: 'relative', isolation: 'isolate' }}
            ref={(el) => {
              // Diagnostic: log z-index and DOM position when dropdown is rendered
              if (el && process.env.NODE_ENV === 'development') {
                const computed = window.getComputedStyle(el);
                // Try multiple selectors to find Modal elements
                const modalOverlay = document.querySelector('[data-name="ModalOverlay"]') || 
                                   document.querySelector('[name="ModalOverlay"]');
                const modalContainer = document.querySelector('[data-name="ModalContainer"]') ||
                                     document.querySelector('[name="ModalContainer"]');
                // Find PortalProvider root host
                const portalHost = document.querySelector('[data-tamagui-portal-host]') || 
                                 document.querySelector('[data-portal-host]');
                // Find all elements with z-index to debug stacking contexts
                const allZIndexElements = Array.from(document.querySelectorAll('*')).filter(el => {
                  const zIndex = window.getComputedStyle(el).zIndex;
                  return zIndex !== 'auto' && zIndex !== '0';
                }).map(el => ({
                  tag: el.tagName,
                  id: el.id,
                  className: el.className,
                  zIndex: window.getComputedStyle(el).zIndex,
                  position: window.getComputedStyle(el).position,
                }));
                
                console.log('Select Portal Info:', {
                  selectZIndex: computed.zIndex,
                  selectPosition: computed.position,
                  portalContainerId: portalContainer.id,
                  portalContainerZIndex: window.getComputedStyle(portalContainer).zIndex,
                  portalHostExists: !!portalHost,
                  portalHostZIndex: portalHost ? window.getComputedStyle(portalHost as Element).zIndex : 'N/A',
                  modalOverlayZIndex: modalOverlay ? window.getComputedStyle(modalOverlay as Element).zIndex : 'not found',
                  modalContainerZIndex: modalContainer ? window.getComputedStyle(modalContainer as Element).zIndex : 'not found',
                  allZIndexElements: allZIndexElements.filter(el => parseInt(el.zIndex) >= 1000),
                });
              }
            }}
          >
            <TamaguiSelect.ScrollUpButton />
            <StyledSelectContent zIndex={10000}>
              <StyledSelectViewport>
                {items}
              </StyledSelectViewport>
            </StyledSelectContent>
            <TamaguiSelect.ScrollDownButton />
          </SelectPortalContent>,
          portalContainer
        )}
    </StyledSelectRoot>
  );
});

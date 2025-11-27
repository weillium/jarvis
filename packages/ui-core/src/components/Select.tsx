'use client';

import { forwardRef, useMemo, ReactNode, useEffect } from 'react';
import { Select as TamaguiSelect, styled, YStack } from 'tamagui';
import type { SelectProps as TamaguiSelectProps } from 'tamagui';

export interface SelectProps extends Omit<TamaguiSelectProps, 'size' | 'children'> {
  size?: 'sm' | 'md';
  children?: ReactNode;
  value?: string;
  defaultValue?: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
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
  paddingVertical: '$2',
  fontSize: '$4',
  width: '100%',
  alignItems: 'center',
  // minHeight calculated: fontSize 14px * 1.4 lineHeight = 20px + paddingVertical $2*2 (16px) = 36px
  // Note: Select.Trigger cannot accept lineHeight prop directly, so it uses font default (~1.5)
  // The minHeight ensures consistent height with Input component
  minHeight: 36,
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
        paddingVertical: '$2',
        fontSize: '$3',
        // minHeight calculated: fontSize 13px * 1.4 lineHeight = 19px + paddingVertical $2*2 (16px) = 35px
        minHeight: 35,
      },
      md: {
        paddingHorizontal: '$4',
        paddingVertical: '$2',
        fontSize: '$4',
        // minHeight calculated: fontSize 14px * 1.4 lineHeight = 20px + paddingVertical $2*2 (16px) = 36px
        minHeight: 36,
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
  // Extremely high z-index to appear above modals (Modal container is 1001)
  // Using 99999 to ensure it's definitely above any modal stacking context
  zIndex: 99999,
  // Absolute positioning - Tamagui handles positioning relative to trigger
  // The portal container is fixed, so absolute positioning here is relative to that
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
// Using YStack as base since styled() requires a component, not a string
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SelectPortalContent = styled(YStack, {
  name: 'SelectPortalContent',
  zIndex: 99999,
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  pointerEvents: 'none',
  // Ensure this creates a new stacking context above everything
  isolation: 'isolate',
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
  
  // Helper to check if an element is an option element
  const isOptionElement = (child: unknown): child is React.ReactElement<HTMLOptionElement> => {
    if (typeof child !== 'object' || child === null) return false;
    if (!('type' in child)) return false;
    const type = (child as { type: unknown }).type;
    // Check for both string 'option' and React element type
    return type === 'option' || (typeof type === 'string' && type.toLowerCase() === 'option');
  };
  
  if (Array.isArray(children)) {
    const items: ReactNode[] = [];
    children.forEach((child, index) => {
      if (isOptionElement(child)) {
        const option = child;
        // CRITICAL: Use option.props.value explicitly - it can be empty string, which is valid
        // If value prop is not provided, it defaults to the text content, but we want to preserve empty string
        const value = option.props.value !== undefined 
          ? String(option.props.value) 
          : (childrenToString(option.props.children) || '');
        const label = childrenToString(option.props.children) || value;
        
        items.push(
          <StyledSelectItem key={value !== '' ? value : `empty-${index}`} value={value} index={index}>
            <TamaguiSelect.ItemText>{String(label)}</TamaguiSelect.ItemText>
          </StyledSelectItem>
        );
      } else if (child !== null && child !== undefined) {
        // Recursively convert nested arrays or option elements
        const converted = convertOptionsToItems(child);
        if (converted) {
          if (Array.isArray(converted)) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            items.push(...(converted as React.ReactNode[]));
          } else {
            items.push(converted);
          }
        }
      }
    });
    return items.length > 0 ? items : null;
  }
  
  if (isOptionElement(children)) {
    const option = children;
    // CRITICAL: Use option.props.value explicitly - it can be empty string, which is valid
    const value = option.props.value !== undefined 
      ? String(option.props.value) 
      : (childrenToString(option.props.children) || '');
    const label = childrenToString(option.props.children) || value;
    
    return (
      <StyledSelectItem value={value} index={0}>
        <TamaguiSelect.ItemText>{label}</TamaguiSelect.ItemText>
      </StyledSelectItem>
    );
  }
  
  return children;
}

export const Select = forwardRef<any, SelectProps>(function Select(props, _ref) {
  const { size, children, value, defaultValue, onChange, onValueChange, disabled, ...rest } = props;
  const sizeProp = size || 'md';
  
  // Ensure DIALOG and PortalProvider root host have high z-index to allow Select dropdowns above Modals
  // Also inject CSS to ensure Select Content has highest z-index
  useEffect(() => {
    if (typeof document !== 'undefined') {
      // Inject CSS to ensure Select Content appears above Modals
      const styleId = 'select-dropdown-z-index-fix';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          /* Ensure Select Content appears above Modals */
          [data-name="SelectContent"],
          .is_SelectContent,
          [class*="SelectContent"],
          [class*="SelectContent"] * {
            z-index: 99999 !important;
            position: relative !important;
          }
          
          /* Ensure DIALOG has high z-index */
          dialog {
            z-index: 10000 !important;
          }
          
          /* Ensure PortalProvider host appears above Modals */
          [data-tamagui-portal-host],
          [data-portal-host] {
            z-index: 10000 !important;
            position: relative !important;
          }
          
          /* Force Select dropdown above Modal overlay and container */
          [data-name="SelectContent"] {
            z-index: 99999 !important;
            position: fixed !important;
          }
        `;
        document.head.appendChild(style);
      }
      
      const setZIndexes = () => {
        // Set DIALOG z-index
        const dialogs = document.querySelectorAll('dialog');
        dialogs.forEach((dialog) => {
          const dialogEl = dialog as HTMLElement;
          const dialogStyle = window.getComputedStyle(dialogEl);
          const currentZIndex = dialogStyle.zIndex === 'auto' ? 0 : parseInt(dialogStyle.zIndex) || 0;
          if (currentZIndex < 10000) {
            dialogEl.style.setProperty('z-index', '10000', 'important');
          }
        });
        
        // Set PortalProvider root host z-index (try multiple possible selectors)
        const portalHost = document.querySelector('[data-tamagui-portal-host]') || 
                          document.querySelector('[data-portal-host]') ||
                          document.querySelector('[id*="portal"]') ||
                          document.querySelector('[class*="portal"]');
        if (portalHost) {
          const hostEl = portalHost as HTMLElement;
          const currentZIndex = parseInt(window.getComputedStyle(hostEl).zIndex) || 0;
          if (currentZIndex < 10000) {
            hostEl.style.setProperty('z-index', '10000', 'important');
          }
        }
      };
      
      // Set immediately and watch for changes
      setZIndexes();
      const observer = new MutationObserver(setZIndexes);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
      
      return () => observer.disconnect();
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
      // Prevent scroll when Select opens (fixes page jumping to top)
      onOpenChange={(open) => {
        // Prevent default scroll behavior when opening
        if (open) {
          // Store current scroll position
          const scrollY = window.scrollY || document.documentElement.scrollTop;
          // Use requestAnimationFrame to restore scroll after Tamagui's focus handling
          requestAnimationFrame(() => {
            window.scrollTo(0, scrollY);
          });
        }
        // Call any user-provided onOpenChange
        if (rest.onOpenChange) {
          rest.onOpenChange(open);
        }
      }}
      {...rest}
    >
      <StyledSelectTrigger size={sizeProp} disabled={disabled}>
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
      <TamaguiSelect.ScrollUpButton />
      <StyledSelectContent 
        zIndex={99999}
      >
        <StyledSelectViewport>
          {items}
        </StyledSelectViewport>
      </StyledSelectContent>
      <TamaguiSelect.ScrollDownButton />
    </StyledSelectRoot>
  );
});

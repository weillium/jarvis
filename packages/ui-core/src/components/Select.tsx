'use client';

import { forwardRef, useMemo, ReactNode, useEffect } from 'react';
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
const SelectPortalContent = styled('div', {
  name: 'SelectPortalContent',
  zIndex: 99999,
  position: 'fixed',
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

export const Select = forwardRef<any, SelectProps>(function Select(props, _ref) {
  const { size, children, value, defaultValue, onChange, onValueChange, ...rest } = props;
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
      // Disable FocusScope to prevent conflicts with Modal's FocusScope
      // This prevents infinite focus loops when Select is inside a Modal
      disableFocusScope={true}
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
      <TamaguiSelect.ScrollUpButton />
      <StyledSelectContent 
        zIndex={99999}
        style={{ zIndex: 99999 }}
        // Ensure Select Content portals correctly and appears above Modal
        modal={false} // Don't create another modal layer
      >
        <StyledSelectViewport>
          {items}
        </StyledSelectViewport>
      </StyledSelectContent>
      <TamaguiSelect.ScrollDownButton />
    </StyledSelectRoot>
  );
});

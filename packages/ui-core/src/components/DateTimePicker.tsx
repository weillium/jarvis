'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { XStack, YStack, Input, Button, useTheme, styled } from 'tamagui';
import { CalendarIcon, ClockIcon } from '../icons';
import { ButtonGroup } from './ButtonGroup';

export interface DateTimePickerProps {
  value?: Date | null;
  onChange?: (value: Date | null) => void;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  id?: string;
  required?: boolean;
  className?: string;
}

// Styled popup container for compact date/time picker
const PopupContainer = styled(YStack, {
  name: 'DateTimePickerPopup',
  position: 'fixed',
  backgroundColor: '$background',
  borderRadius: '$4',
  borderWidth: 1,
  borderColor: '$borderColor',
  padding: '$4',
  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  zIndex: 10000,
  width: 'auto',
  maxWidth: '100vw',
  overflow: 'visible',
});

export const DateTimePickerComponent = forwardRef<HTMLDivElement, DateTimePickerProps>(
  function DateTimePickerComponent(props, ref) {
    const { value, onChange, disabled, minDate, maxDate, id, className } = props;
    const [show, setShow] = useState(false);
    const [tempDate, setTempDate] = useState<Date | null>(value || null);
    const [tempTime, setTempTime] = useState<Date | null>(value || null);
    const internalRef = useRef<HTMLDivElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const theme = useTheme();
    
    // Sync tempDate with value prop
    useEffect(() => {
      setTempDate(value || null);
      setTempTime(value || null);
    }, [value]);
    
    // Combine refs
    useEffect(() => {
      if (ref) {
        if (typeof ref === 'function') {
          ref(internalRef.current);
        } else if (ref && typeof ref === 'object' && 'current' in ref) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          (ref as any).current = internalRef.current;
        }
      }
    }, [ref]);
    
    // Position popup near the input field and keep it fixed during scroll
    // Also measure and match time component height to date component
    useEffect(() => {
      if (!show || !internalRef.current || !popupRef.current) return;
      
      // Prevent page scrolling when popup is open
      const preventPageScroll = (e: WheelEvent) => {
        const target = e.target as HTMLElement;
        // Allow scrolling within the time list
        if (target.closest('.react-datepicker__time-list')) {
          return; // Allow this scroll
        }
        // Prevent scrolling everywhere else in the popup
        if (target.closest('[data-name="DateTimePickerPopup"]')) {
          e.preventDefault();
          e.stopPropagation();
        }
      };
      
      // Prevent touch scrolling on mobile
      const preventTouchScroll = (e: TouchEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('.react-datepicker__time-list')) {
          return; // Allow this scroll
        }
        if (target.closest('[data-name="DateTimePickerPopup"]')) {
          e.preventDefault();
          e.stopPropagation();
        }
      };
      
      document.addEventListener('wheel', preventPageScroll, { passive: false });
      document.addEventListener('touchmove', preventTouchScroll, { passive: false });
      
      const updatePosition = (forceBelow = false) => {
        if (!internalRef.current || !popupRef.current) return;
        
        const inputRect = internalRef.current.getBoundingClientRect();
        const popup = popupRef.current;
        // Use actual dimensions from the rendered popup
        const popupHeight = popup.offsetHeight || 400;
        const popupWidth = popup.offsetWidth || 320;
        
        // If popup height is still 0 or very small, it's not fully rendered yet
        // Wait a bit and try again
        if (popupHeight < 100 && !forceBelow) {
          requestAnimationFrame(() => {
            setTimeout(() => updatePosition(false), 50);
          });
          return;
        }
        
        // Position below the input by default (preferred)
        // Use getBoundingClientRect which is viewport-relative (scroll-independent)
        let top = inputRect.bottom + 8;
        let left = inputRect.left;
        
        // Only position above if there's not enough space below AND enough space above
        const spaceBelow = window.innerHeight - inputRect.bottom;
        const spaceAbove = inputRect.top;
        const needsAbove = top + popupHeight > window.innerHeight;
        const hasEnoughAbove = spaceAbove >= popupHeight + 8;
        
        // Prefer below, only go above if necessary and there's enough space
        if (needsAbove && hasEnoughAbove && spaceAbove > spaceBelow) {
          top = inputRect.top - popupHeight - 8;
        }
        
        // Ensure popup stays within viewport
        if (top < 0) {
          top = 8;
        }
        if (left + popupWidth > window.innerWidth) {
          left = window.innerWidth - popupWidth - 8;
        }
        if (left < 0) {
          left = 8;
        }
        
        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;
      };
      
      // Measure date component height and match time component
      const matchHeights = () => {
        try {
          // Find date picker - it has tamagui-datepicker but NOT tamagui-timepicker
          const datePicker = popupRef.current?.querySelector('.tamagui-datepicker:not(.tamagui-timepicker)') as HTMLElement;
          
          // Find time picker - it has both tamagui-datepicker AND tamagui-timepicker classes
          const timePicker = popupRef.current?.querySelector('.tamagui-timepicker.react-datepicker') as HTMLElement ||
                            popupRef.current?.querySelector('.react-datepicker--time-only') as HTMLElement;
          
          if (!datePicker) {
            console.log('Date picker not found');
            return;
          }
          
          if (!timePicker) {
            console.log('Time picker not found');
            return;
          }
          
          const dateHeight = datePicker.offsetHeight;
          const timePickerHeight = timePicker.offsetHeight;
          
          // Debug: Check all the components
          const dateHeader = datePicker.querySelector('.react-datepicker__header') as HTMLElement;
          const dateMonth = datePicker.querySelector('.react-datepicker__month') as HTMLElement;
          const timeHeader = timePicker.querySelector('.react-datepicker__header') as HTMLElement;
          const timeContainer = timePicker.querySelector('.react-datepicker__time-container') as HTMLElement;
          const timeList = timePicker.querySelector('.react-datepicker__time-list') as HTMLElement;
          
          console.log('=== Height Analysis ===');
          console.log('Date picker total height:', dateHeight, 'px');
          console.log('Time picker total height:', timePickerHeight, 'px');
          console.log('Difference:', dateHeight - timePickerHeight, 'px');
          console.log('Date header height:', dateHeader?.offsetHeight || 0, 'px');
          console.log('Date month height:', dateMonth?.offsetHeight || 0, 'px');
          console.log('Time header height:', timeHeader?.offsetHeight || 0, 'px');
          console.log('Time container height:', timeContainer?.offsetHeight || 0, 'px');
          console.log('Time list height:', timeList?.offsetHeight || 0, 'px');
          
          // Get computed styles to check padding/borders
          const dateStyle = window.getComputedStyle(datePicker);
          const timeStyle = window.getComputedStyle(timePicker);
          console.log('Date picker padding-top:', dateStyle.paddingTop);
          console.log('Date picker padding-bottom:', dateStyle.paddingBottom);
          console.log('Time picker padding-top:', timeStyle.paddingTop);
          console.log('Time picker padding-bottom:', timeStyle.paddingBottom);
          
          if (dateHeight > 0) {
            // Match the entire time picker frame to the date picker height
            timePicker.style.setProperty('height', `${dateHeight}px`, 'important');
            timePicker.style.setProperty('min-height', `${dateHeight}px`, 'important');
            console.log('Time picker height set to:', dateHeight, 'px');
            
            // Calculate the available height for the time container (total height minus header)
            const headerHeight = timeHeader?.offsetHeight || 0;
            const containerHeight = dateHeight - headerHeight;
            
            // Set the time container to fill the remaining space
            if (timeContainer) {
              timeContainer.style.height = `${containerHeight}px`;
              timeContainer.style.overflow = 'hidden';
            }
            
            // Set the time list to fill the container and scroll
            if (timeList) {
              timeList.style.height = '100%';
              timeList.style.overflowY = 'auto';
              timeList.style.overflowX = 'hidden';
              timeList.style.maxHeight = `${containerHeight}px`;
              
              // Ensure scroll events work on the time list
              timeList.addEventListener('wheel', (e) => {
                e.stopPropagation();
              }, { passive: true });
            }
            
            console.log('Time container height set to:', containerHeight, 'px (header:', headerHeight, 'px)');
            
            // Recalculate position after heights are matched (popup size may have changed)
            updatePosition(true);
          } else {
            console.log('Date height is 0, retrying...');
            setTimeout(matchHeights, 100);
          }
        } catch (error) {
          console.error('Error matching heights:', error);
        }
      };
      
      // Measure and match heights first, then position
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        setTimeout(() => {
          matchHeights();
          // Also do an initial position update after a short delay to ensure popup is rendered
          setTimeout(() => updatePosition(true), 100);
        }, 50);
      });
      
      // Update position on scroll to keep it fixed relative to viewport
      // Only update if scroll is from window/document, not from inside the popup
      const handleScroll = (e: Event) => {
        const target = e.target as HTMLElement;
        // Don't reposition if scrolling inside the popup (time list, etc.)
        if (target && popupRef.current && popupRef.current.contains(target)) {
          return;
        }
        updatePosition(true);
      };
      
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', () => {
        updatePosition(true);
        matchHeights();
      });
      
      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', updatePosition);
        document.removeEventListener('wheel', preventPageScroll);
        document.removeEventListener('touchmove', preventTouchScroll);
      };
    }, [show]);
    
    // Close popup when clicking outside
    useEffect(() => {
      if (!show) return;
      
      const handleClickOutside = (e: MouseEvent) => {
        if (
          popupRef.current &&
          !popupRef.current.contains(e.target as Node) &&
          internalRef.current &&
          !internalRef.current.contains(e.target as Node)
        ) {
          setShow(false);
        }
      };
      
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [show]);
    
    const handleOpen = (e?: any) => {
      if (!disabled) {
        // Stop event propagation to prevent closing parent modal
        if (e && typeof e === 'object') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
          e.stopPropagation?.();
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
          e.preventDefault?.();
        }
        setTempDate(value || new Date());
        setTempTime(value || new Date());
        setShow(true);
      }
    };
    
    const handleClose = () => {
      setShow(false);
    };
    
    const handleDateChange = (date: Date | null) => {
      if (date) {
        setTempDate(date);
        // Merge date with existing time
        if (tempTime) {
          const merged = new Date(date);
          merged.setHours(tempTime.getHours());
          merged.setMinutes(tempTime.getMinutes());
          merged.setSeconds(tempTime.getSeconds());
          merged.setMilliseconds(tempTime.getMilliseconds());
          setTempTime(merged);
        } else {
          // If no time set, use current time or midnight
          const merged = new Date(date);
          if (value) {
            merged.setHours(value.getHours());
            merged.setMinutes(value.getMinutes());
            merged.setSeconds(value.getSeconds());
          } else {
            merged.setHours(new Date().getHours());
            merged.setMinutes(new Date().getMinutes());
          }
          setTempTime(merged);
        }
      }
    };
    
    const handleTimeChange = (time: Date | null) => {
      if (time) {
        setTempTime(time);
        // Merge time with existing date
        if (tempDate) {
          const merged = new Date(tempDate);
          merged.setHours(time.getHours());
          merged.setMinutes(time.getMinutes());
          merged.setSeconds(time.getSeconds());
          merged.setMilliseconds(time.getMilliseconds());
          setTempDate(merged);
        } else {
          // If no date set, use today's date
          const merged = new Date();
          merged.setHours(time.getHours());
          merged.setMinutes(time.getMinutes());
          merged.setSeconds(time.getSeconds());
          merged.setMilliseconds(time.getMilliseconds());
          setTempDate(merged);
        }
      }
    };
    
    const handleConfirm = () => {
      // Use tempDate as it should have both date and time merged
      if (tempDate) {
        onChange?.(tempDate);
      }
      setShow(false);
    };
    
    const formatDateTime = (date: Date | null): string => {
      if (!date) return '';
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    };
    
    // Apply styles to react-datepicker
    useEffect(() => {
      const style = document.createElement('style');
      style.id = 'react-datepicker-tamagui-styles';
      
      const existingStyle = document.getElementById('react-datepicker-tamagui-styles');
      if (existingStyle) {
        existingStyle.remove();
      }
      
      const getThemeValue = (key: string, fallback: string): string => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          const val = (theme as any)[key];
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          return val?.get?.() || fallback;
        } catch {
          return fallback;
        }
      };
      
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const borderColor: string = getThemeValue('borderColor', '#e2e8f0');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const backgroundColor: string = getThemeValue('background', '#ffffff');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const textColor: string = getThemeValue('color', '#0f172a');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const blue6: string = getThemeValue('blue6', '#3b82f6');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const blue7: string = getThemeValue('blue7', '#2563eb');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const backgroundHover: string = getThemeValue('backgroundHover', '#f8fafc');
      
      style.textContent = `
        .react-datepicker {
          border: 1px solid ${borderColor};
          border-radius: 8px;
          background-color: ${backgroundColor};
          font-family: Inter, sans-serif;
          width: auto !important;
          box-sizing: border-box !important;
        }
        .react-datepicker__header {
          background-color: ${backgroundColor};
          border-bottom: 1px solid ${borderColor};
        }
        .react-datepicker__current-month {
          color: ${textColor};
        }
        .react-datepicker__day-name {
          color: ${textColor};
          opacity: 0.7;
        }
        .react-datepicker__day {
          color: ${textColor};
        }
        .react-datepicker__day:hover {
          background-color: ${backgroundHover};
        }
        .react-datepicker__day--selected,
        .react-datepicker__day--keyboard-selected {
          background-color: ${blue6};
          color: white;
        }
        .react-datepicker__day--selected:hover,
        .react-datepicker__day--keyboard-selected:hover {
          background-color: ${blue7};
        }
        .react-datepicker--time-only,
        .tamagui-timepicker {
          width: auto !important;
          display: flex !important;
          flex-direction: column !important;
        }
        .tamagui-timepicker .react-datepicker {
          width: auto !important;
          display: flex !important;
          flex-direction: column !important;
        }
        .react-datepicker__time-container {
          border-left: none !important;
          width: auto !important;
          height: 100% !important;
          overflow: hidden !important;
        }
        .react-datepicker__time-container .react-datepicker__time {
          background-color: ${backgroundColor};
          width: auto !important;
          height: 100% !important;
          overflow: hidden !important;
        }
        .react-datepicker__time-container .react-datepicker__time .react-datepicker__time-box {
          width: auto !important;
          height: 100% !important;
          overflow: hidden !important;
        }
        .react-datepicker__time-list {
          width: auto !important;
          height: 100% !important;
          overflow-y: auto !important;
          overflow-x: hidden !important;
          -webkit-overflow-scrolling: touch !important;
        }
        .react-datepicker__time-list:focus {
          outline: none !important;
        }
        .react-datepicker__time-list-item--selected {
          background-color: ${blue6};
          color: white;
        }
        .react-datepicker__time-list-item:hover {
          background-color: ${backgroundHover};
        }
      `;
      
      document.head.appendChild(style);
      
      return () => {
        const styleEl = document.getElementById('react-datepicker-tamagui-styles');
        if (styleEl) {
          styleEl.remove();
        }
      };
    }, [theme]);
    
    return (
      <div
        ref={internalRef}
        className={className}
        style={{ width: '100%', minWidth: 0, flexBasis: 0, flexGrow: 1, flexShrink: 1, position: 'relative', zIndex: 1 }}
        onClick={(e) => {
          // Stop event propagation to prevent closing parent modal
          e.stopPropagation();
        }}
        onMouseDown={(e) => {
          // Also stop on mousedown to catch all click events
          e.stopPropagation();
        }}
      >
        <Button
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
          variant={"ghost" as any}
          onPress={(e: any) => {
            // Stop event propagation to prevent closing parent modal
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            e?.stopPropagation?.();
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            e?.preventDefault?.();
            handleOpen(e);
          }}
          disabled={disabled}
          padding={0}
          minHeight="auto"
          width="100%"
          opacity={disabled ? 0.6 : 1}
          pressStyle={{ opacity: disabled ? 0.6 : 0.8 }}
        >
          <XStack
            alignItems="center"
            justifyContent="flex-end"
            position="relative"
            width="100%"
            pointerEvents="none"
          >
            <Input
              pointerEvents="none"
              editable={false}
              flexGrow={1}
              value={formatDateTime(value ?? null)}
              disabled={disabled}
              id={id}
              placeholder="Select date and time"
              readOnly
              width="100%"
            />
            <XStack paddingRight="$4" position="absolute" pointerEvents="none" right={0}>
              <CalendarIcon size={18} color={disabled ? undefined : '$gray11'} />
            </XStack>
          </XStack>
        </Button>
        
        {show && typeof document !== 'undefined' && createPortal(
          <PopupContainer
            ref={popupRef}
            gap="$4"
            data-name="DateTimePickerPopup"
            onClick={(e: any) => {
              // Prevent closing parent modal
              e?.stopPropagation?.();
            }}
            onMouseDown={(e: any) => {
              // Prevent closing parent modal
              e?.stopPropagation?.();
            }}
          >
            <XStack gap="$3" alignItems="flex-start" width="auto">
              <YStack gap="$2" minWidth={0} flexShrink={0}>
                <XStack alignItems="center" gap="$2">
                  <CalendarIcon size={18} />
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>Date</span>
                </XStack>
                <div style={{ width: 'auto', overflow: 'visible' }}>
                  <DatePicker
                    selected={tempDate}
                    onChange={handleDateChange}
                    minDate={minDate}
                    maxDate={maxDate}
                    inline
                    calendarClassName="tamagui-datepicker"
                  />
                </div>
              </YStack>
              
              <YStack gap="$2" minWidth={0} flexShrink={0}>
                <XStack alignItems="center" gap="$2">
                  <ClockIcon size={18} />
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>Time</span>
                </XStack>
                <div style={{ width: 'auto', overflow: 'visible' }}>
                  <DatePicker
                    selected={tempTime}
                    onChange={handleTimeChange}
                    showTimeSelect
                    showTimeSelectOnly
                    timeIntervals={15}
                    timeCaption="Time"
                    dateFormat="h:mm aa"
                    inline
                    calendarClassName="tamagui-datepicker tamagui-timepicker"
                  />
                </div>
              </YStack>
            </XStack>
            
            <ButtonGroup>
              {/* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment */}
              <Button variant={"outline" as any} onPress={handleClose}>
                Cancel
              </Button>
              {/* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment */}
              <Button variant={"primary" as any} onPress={handleConfirm}>
                Confirm
              </Button>
            </ButtonGroup>
          </PopupContainer>,
          document.body
        )}
      </div>
    );
  }
);

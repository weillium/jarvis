'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { XStack, YStack, Input, Button, Sheet, useTheme } from 'tamagui';
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

export const DateTimePickerComponent = forwardRef<HTMLDivElement, DateTimePickerProps>(
  function DateTimePickerComponent(props, ref) {
    const { value, onChange, disabled, minDate, maxDate, id, className } = props;
    const [show, setShow] = useState(false);
    const [tempDate, setTempDate] = useState<Date | null>(value || null);
    const [tempTime, setTempTime] = useState<Date | null>(value || null);
    const internalRef = useRef<HTMLDivElement>(null);
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
        .react-datepicker__time-container {
          border-left: 1px solid ${borderColor};
        }
        .react-datepicker__time-list-item--selected {
          background-color: ${blue6};
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
        
        <Sheet 
          modal 
          open={show} 
          onOpenChange={(open: boolean) => {
            setShow(open);
            if (!open) {
              handleClose();
            }
          }} 
          snapPoints={[85]} 
          dismissOnSnapToBottom
          zIndex={100000}
        >
          <Sheet.Overlay 
            onPress={(e: any) => {
              // Prevent closing parent modal when clicking overlay
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
              e?.stopPropagation?.();
            }}
          />
          <Sheet.Handle />
          <Sheet.Frame 
            padding="$6" 
            backgroundColor="$background" 
            zIndex={100001}
            onPress={(e: any) => {
              // Prevent closing parent modal when clicking inside sheet
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
              e?.stopPropagation?.();
            }}
          >
            <YStack gap="$5">
              <YStack gap="$3">
                <XStack gap="$4" $sm={{ flexDirection: 'column' }} $md={{ flexDirection: 'row' }}>
                  <YStack flex={1} gap="$2">
                    <XStack alignItems="center" gap="$2">
                      <CalendarIcon size={20} />
                      <span style={{ fontWeight: 600, fontSize: '14px' }}>Date</span>
                    </XStack>
                    <DatePicker
                      selected={tempDate}
                      onChange={handleDateChange}
                      minDate={minDate}
                      maxDate={maxDate}
                      inline
                      calendarClassName="tamagui-datepicker"
                    />
                  </YStack>
                  
                  <YStack flex={1} gap="$2">
                    <XStack alignItems="center" gap="$2">
                      <ClockIcon size={20} />
                      <span style={{ fontWeight: 600, fontSize: '14px' }}>Time</span>
                    </XStack>
                    <DatePicker
                      selected={tempTime}
                      onChange={handleTimeChange}
                      showTimeSelect
                      showTimeSelectOnly
                      timeIntervals={15}
                      timeCaption="Time"
                      dateFormat="h:mm aa"
                      inline
                      calendarClassName="tamagui-datepicker"
                    />
                  </YStack>
                </XStack>
              </YStack>
              
              <ButtonGroup>
                {/* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment */}
                <Button variant={"outline" as any} size="sm" onPress={handleClose}>
                  Cancel
                </Button>
                {/* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment */}
                <Button variant={"primary" as any} size="sm" onPress={handleConfirm}>
                  Confirm
                </Button>
              </ButtonGroup>
            </YStack>
          </Sheet.Frame>
        </Sheet>
      </div>
    );
  }
);

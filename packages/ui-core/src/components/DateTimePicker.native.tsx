import { forwardRef } from 'react';
import { Input, XStack } from 'tamagui';

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

// Native-friendly placeholder: render a read-only input with the current value.
// The full web picker relies on react-dom/react-datepicker which are not available on native.
export const DateTimePickerComponent = forwardRef<any, DateTimePickerProps>(
  function DateTimePickerComponent({ value, disabled, id, required, className }, ref) {
    const formatted = value ? value.toLocaleString() : '';
    return (
      <XStack>
        <Input
          ref={ref}
          id={id}
          editable={false}
          value={formatted}
          placeholder="Select date/time on web"
          disabled={disabled}
          className={className}
          aria-required={required}
        />
      </XStack>
    );
  }
);

export default DateTimePickerComponent;

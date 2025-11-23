'use client';

import { useState, useMemo } from 'react';
import { YStack, XStack, Text, Card, Input } from 'tamagui';
import { Button } from './Button';
import { Modal } from './Modal';
import { Select } from './Select';
import { DateTimePickerComponent as DateTimePicker } from './DateTimePicker';
import { FormField } from './FormField';
import { ModalContent } from './ModalContent';

/**
 * Smoke test component to verify Tamagui setup
 * Use this to test that Tamagui is properly configured in both web and mobile
 */
export function SmokeTest() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [date, setDate] = useState<Date | null>(new Date());

  // Memoize timezone list
  const timezones = useMemo(() => Intl.supportedValuesOf('timeZone').sort(), []);

  return (
    <YStack padding="$4" gap="$4" backgroundColor="$background">
      <Card padding="$4" backgroundColor="$background" borderWidth={1} borderColor="$borderColor" borderRadius="$4">
        <YStack gap="$3">
          <Text fontSize="$6" fontWeight="600" color="$color">
            Tamagui Smoke Test
          </Text>
          <Text fontSize="$4" color="$colorHover">
            If you can see this styled component, Tamagui is working!
          </Text>
        </YStack>
      </Card>

      <XStack gap="$3" flexWrap="wrap">
        <Button variant="primary">
          Primary Button
        </Button>
        <Button variant="outline">
          Outlined Button
        </Button>
        <Button 
          variant="primary"
          onPress={() => setIsModalOpen(true)}
        >
          Test Modal with Select
        </Button>
      </XStack>

      <YStack gap="$2">
        <Text fontSize="$3" color="$colorHover">
          Input Test:
        </Text>
        <Input
          placeholder="Type something..."
          borderWidth={1}
          borderColor="$borderColor"
          borderRadius="$3"
          padding="$3"
        />
      </YStack>

      <Card padding="$4" backgroundColor="$gray2" borderRadius="$4">
        <Text fontSize="$3" color="$gray11">
          Theme tokens are working if colors appear correctly above.
        </Text>
      </Card>

      {/* Select and DateTimePicker outside Modal - Basic Test */}
      <Card padding="$4" gap="$4">
        <Text fontSize="$6" fontWeight="600" color="$color">
          Select & DateTimePicker (Outside Modal)
        </Text>
        <Text fontSize="$4" color="$colorHover" marginBottom="$4">
          Testing Select and DateTimePicker components without Modal to verify basic functionality.
        </Text>
        <YStack gap="$5">
          <FormField label="Timezone" required>
            <Select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              size="md"
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Date and Time" required>
            <DateTimePicker
              value={date}
              onChange={setDate}
              minDate={new Date()}
            />
          </FormField>
        </YStack>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Test Modal with Select and DateTimePicker"
        maxWidth={800}
      >
        <ModalContent description="This modal contains a Select dropdown and DateTimePicker to test z-index stacking.">
          <YStack gap="$5">
            <FormField label="Timezone" required>
              <Select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                size="md"
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Date and Time" required>
              <DateTimePicker
                value={date}
                onChange={setDate}
                minDate={new Date()}
              />
            </FormField>

            <XStack gap="$3" justifyContent="flex-end">
              <Button 
                variant="outline" 
                onPress={() => setIsModalOpen(false)}
              >
                Close
              </Button>
            </XStack>
          </YStack>
        </ModalContent>
      </Modal>
    </YStack>
  );
}


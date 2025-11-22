'use client';

import { useAuth } from '@/shared/hooks/use-auth';
import {
  YStack,
  XStack,
  Card,
  Heading,
  Body,
  Input,
  Button,
  Select,
  FormField,
  ButtonGroup,
} from '@jarvis/ui-core';

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <YStack maxWidth={1400} marginHorizontal="auto" width="100%" gap="$6">
      <YStack gap="$2">
        <Heading level={1}>Profile</Heading>
        <Body tone="muted">Manage your account settings and preferences</Body>
      </YStack>

      <XStack gap="$4" flexWrap="wrap" alignItems="flex-start">
        <Card flex={1} minWidth={320} padding="$4">
          <YStack gap="$4">
            <Heading level={3}>Account Information</Heading>

            <FormField label="Email Address">
              <Input value={user?.email ?? ''} readOnly backgroundColor="$gray1" />
            </FormField>

            <FormField label="Full Name">
              <Input placeholder="Enter your full name" />
            </FormField>

            <FormField label="Institution">
              <Input placeholder="Enter your institution" />
            </FormField>

            <FormField label="Role">
              <Select>
                <option>Select role...</option>
                <option>Event Organizer</option>
                <option>Researcher</option>
                <option>Administrator</option>
              </Select>
            </FormField>

            <ButtonGroup align="end">
              <Button>Save Changes</Button>
            </ButtonGroup>
          </YStack>
        </Card>

        <YStack gap="$4" width={400} maxWidth="100%">
          <Card padding="$4">
            <YStack gap="$3">
              <Heading level={4}>Security</Heading>
              <FormField label="Current Password">
                <Input type="password" placeholder="Enter current password" maskToggle />
              </FormField>
              <FormField label="New Password">
                <Input type="password" placeholder="Enter new password" maskToggle />
              </FormField>
              <ButtonGroup align="end">
                <Button variant="outline">Update Password</Button>
              </ButtonGroup>
            </YStack>
          </Card>

          <Card padding="$4">
            <YStack gap="$3">
              <Heading level={4}>Preferences</Heading>
              {['Email notifications', 'Weekly summaries'].map((label) => (
                <Button key={label} variant="ghost" justifyContent="flex-start">
                  {label}
                </Button>
              ))}
            </YStack>
          </Card>
        </YStack>
      </XStack>
    </YStack>
  );
}

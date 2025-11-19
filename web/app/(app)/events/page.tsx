'use client';

import { useState } from 'react';
import { CreateEventModal } from '@/features/events/components/create-event-modal';
import { EventsList } from '@/features/events/components/events-list';
import {
  PageContainer,
  PageHeader,
  Toolbar,
  ToolbarSpacer,
  Heading,
  Body,
  Button,
  Input,
  Select,
  Card,
  YStack,
  Separator,
} from '@jarvis/ui-core';

export default function EventsIndex() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'scheduled' | 'live' | 'ended'>('all');

  return (
    <>
      <PageContainer>
        <Toolbar>
          <PageHeader>
            <Heading level={2}>Events</Heading>
            <Body tone="muted">Manage and monitor your academic events</Body>
          </PageHeader>
          <ToolbarSpacer />
          <Button onPress={() => setIsModalOpen(true)}>Create Event</Button>
        </Toolbar>

        <Card variant="outlined" padding="$0" overflow="hidden">
          <YStack padding="$4" borderBottomWidth={1} borderBottomColor="$borderColor">
            <Toolbar>
              <Input
                placeholder="Search events..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                flex={1}
              />
              <Select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as 'all' | 'scheduled' | 'live' | 'ended')
                }
              >
                <option value="all">All Status</option>
                <option value="live">Live</option>
                <option value="scheduled">Scheduled</option>
                <option value="ended">Ended</option>
              </Select>
            </Toolbar>
          </YStack>
          <Separator />
          <YStack padding="$5">
            <EventsList searchQuery={searchQuery} statusFilter={statusFilter} />
          </YStack>
        </Card>
      </PageContainer>
      <CreateEventModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          setIsModalOpen(false);
          window.location.reload();
        }}
      />
    </>
  );
}

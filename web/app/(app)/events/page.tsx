'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { EventsList } from '@/features/events/components/events-list';
import {
  PageContainer,
  PageHeader,
  Toolbar,
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
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'scheduled' | 'live' | 'ended'>('all');

  return (
    <>
      <PageContainer>
        <PageHeader>
          <Heading level={2}>Events</Heading>
          <Body tone="muted">Manage and monitor your academic events</Body>
        </PageHeader>

        <Card variant="outlined" padding="$0" overflow="hidden">
          <YStack padding="$4" borderBottomWidth={1} borderBottomColor="$borderColor">
            <Toolbar>
              <Toolbar.Item flex={1}>
                <Input
                  placeholder="Search events..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  width="100%"
                />
              </Toolbar.Item>
              <Toolbar.Item flex={0} minWidth={200}>
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
              </Toolbar.Item>
              <Toolbar.Item flex={0}>
                <Button size="sm" onPress={() => router.push('/events/new')}>
                  Create Event
                </Button>
              </Toolbar.Item>
            </Toolbar>
          </YStack>
          <Separator />
          <YStack padding="$5">
            <EventsList searchQuery={searchQuery} statusFilter={statusFilter} />
          </YStack>
        </Card>
      </PageContainer>
    </>
  );
}

import { useRouter } from 'expo-router'
import { useEvents } from 'features/events/hooks/use-events'
import { EventCard } from 'features/events/components/event-card'
import { YStack, LoadingState, Alert, Text } from '@jarvis/ui-core'
import { FlatList, RefreshControl } from 'react-native'

export default function EventsPage() {
  const router = useRouter()
  const { events, loading, error, refetch } = useEvents()

  if (loading && events.length === 0) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$background">
        <LoadingState title="Loading events" description="Fetching your events..." />
      </YStack>
    )
  }

  return (
    <YStack flex={1} backgroundColor="$background" padding="$4">
      {error && (
        <Alert variant="error" marginBottom="$4">
          {error}
        </Alert>
      )}

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <YStack marginBottom="$3">
            <EventCard event={item} />
          </YStack>
        )}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refetch} />
        }
        ListEmptyComponent={
          !loading ? (
            <YStack alignItems="center" padding="$8">
              <Text color="$gray11" textAlign="center">
                No events found. Create one on the web app to get started.
              </Text>
            </YStack>
          ) : null
        }
      />
    </YStack>
  )
}

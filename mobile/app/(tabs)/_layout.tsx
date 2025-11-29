import { Tabs } from 'expo-router'
import { useTheme, Text } from 'tamagui'

export default function TabsLayout() {
  const theme = useTheme()

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.blue11.val as string,
        tabBarInactiveTintColor: theme.gray11.val as string,
        tabBarStyle: {
          backgroundColor: theme.background.val as string,
          borderTopColor: theme.borderColor.val as string,
          borderTopWidth: 1,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <Text fontSize="$6" color={color}>
              🏠
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: ({ color }) => (
            <Text fontSize="$6" color={color}>
              📅
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color }) => (
            <Text fontSize="$6" color={color}>
              👤
            </Text>
          ),
        }}
      />
    </Tabs>
  )
}

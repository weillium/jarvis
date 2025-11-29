import { YStack, Heading } from '@jarvis/ui-core'

export default function HomePage() {
  return (
    <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$background" padding="$4">
      <Heading level={2}>Welcome</Heading>
    </YStack>
  )
}

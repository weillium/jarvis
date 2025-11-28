import { router } from 'expo-router';
import {
  YStack,
  XStack,
  Heading,
  Body,
  Button,
  Card,
  Text,
  ButtonGroup,
} from '@jarvis/ui-core';

const heroButtons = [
  { label: 'Start Your Event', route: '/auth', variant: 'primary' as const },
  { label: 'Learn More', route: '#features', variant: 'outline' as const },
];

const featureCards = [
  {
    title: 'Real-Time Context',
    description: 'AI agents process live transcripts to surface relevant context as sessions unfold.',
  },
  {
    title: 'Intelligent Insights',
    description: 'Generate summaries, links, and action items directly from research and sessions.',
  },
  {
    title: 'Seamless Integration',
    description: 'Drop into your existing event stack without custom infrastructure work.',
  },
];

const useCases = ['Conference Keynotes', 'Research Seminars', 'Academic Workshops', 'Department Colloquia'];

export function LandingPage() {
  const handleNavigation = (route: string) => {
    if (route.startsWith('#')) {
      // Handle anchor links - scroll to section (simplified for mobile)
      return;
    } else {
      router.push(route as any);
    }
  };

  return (
    <YStack backgroundColor="$gray1" minHeight="100%" gap="$0">
      {/* Navigation */}
      <YStack width="100%" alignItems="center" paddingHorizontal="$6" paddingVertical="$4">
        <XStack
          width="100%"
          alignItems="center"
          justifyContent="space-between"
          gap="$4"
        >
          <Heading level={3}>Jarvis</Heading>
          <ButtonGroup orientation="horizontal" wrap>
            <Button variant="ghost" size="sm" onPress={() => handleNavigation('/auth')}>
              Sign In
            </Button>
            <Button size="sm" onPress={() => handleNavigation('/auth')}>
              Get Started
            </Button>
          </ButtonGroup>
        </XStack>
      </YStack>

      {/* Hero */}
      <YStack width="100%" alignItems="center" paddingHorizontal="$6" paddingVertical="$9">
        <YStack maxWidth={960} alignItems="center" gap="$5">
          <Heading level={1} textAlign="center">
            Intelligent Context for Academic Events
          </Heading>
          <Body size="lg" tone="muted" textAlign="center">
            Real-time AI agents that understand your content, provide contextual insights, and enhance
            engagement for organizers and participants.
          </Body>
          <XStack gap="$3" flexWrap="wrap" justifyContent="center">
            {heroButtons.map((button) => (
              <Button
                key={button.label}
                variant={button.variant === 'outline' ? 'outline' : 'primary'}
                size="lg"
                onPress={() => handleNavigation(button.route)}
              >
                {button.label}
              </Button>
            ))}
          </XStack>
        </YStack>
      </YStack>

      {/* Features */}
      <YStack width="100%" alignItems="center" paddingHorizontal="$6" paddingVertical="$9">
        <YStack maxWidth={1100} alignItems="center" gap="$6">
          <Heading level={2} textAlign="center">
            Powerful Features for Event Excellence
          </Heading>
          <YStack gap="$4" width="100%">
            {featureCards.map((feature) => (
              <Card
                key={feature.title}
                variant="outlined"
                width="100%"
                padding="$5"
                gap="$2"
              >
                <Heading level={4}>{feature.title}</Heading>
                <Body tone="muted">{feature.description}</Body>
              </Card>
            ))}
          </YStack>
        </YStack>
      </YStack>

      {/* Use Cases */}
      <YStack width="100%" alignItems="center" backgroundColor="$gray2" paddingHorizontal="$6" paddingVertical="$9">
        <YStack maxWidth={1100} alignItems="center" gap="$4">
          <Heading level={2} textAlign="center">
            Designed for Academic Excellence
          </Heading>
          <Body size="lg" tone="muted" textAlign="center">
            Built for universities, research institutions, and professional conference organizers.
          </Body>
          <YStack gap="$3" width="100%">
            {useCases.map((useCase) => (
              <Card key={useCase} variant="outlined" padding="$4" alignItems="center" width="100%">
                <Text fontSize="$4" fontWeight="600" color="$color">
                  {useCase}
                </Text>
              </Card>
            ))}
          </YStack>
        </YStack>
      </YStack>

      {/* Call to action */}
      <YStack width="100%" alignItems="center" backgroundColor="$gray10" paddingHorizontal="$6" paddingVertical="$9">
        <YStack maxWidth={800} alignItems="center" gap="$4">
          <Heading level={2} color="$gray1" textAlign="center">
            Ready to Transform Your Events?
          </Heading>
          <Body size="lg" tone="muted" textAlign="center" color="$gray2">
            Join leading institutions using Jarvis to deliver exceptional event experiences.
          </Body>
          <Button size="lg" variant="primary" onPress={() => handleNavigation('/auth')}>
            Get Started Today
          </Button>
        </YStack>
      </YStack>

      {/* Footer */}
      <YStack width="100%" alignItems="center" backgroundColor="$gray9" paddingHorizontal="$6" paddingVertical="$5">
        <XStack
          width="100%"
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          gap="$3"
        >
          <Heading level={4} color="$gray1">
            Jarvis
          </Heading>
          <Body size="sm" tone="muted" color="$gray3">
            © {new Date().getFullYear()} Jarvis. All rights reserved.
          </Body>
        </XStack>
      </YStack>
    </YStack>
  );
}




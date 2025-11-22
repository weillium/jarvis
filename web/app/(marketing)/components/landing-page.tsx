'use client';

import { useRouter } from 'next/navigation';
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
  { label: 'Start Your Event', href: '/auth', variant: 'primary' as const },
  { label: 'Learn More', href: '#features', variant: 'outline' as const },
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

export default function LandingPage() {
  const router = useRouter();

  const handleNavigation = (href: string) => {
    if (href.startsWith('#')) {
      // Handle anchor links
      const element = document.querySelector(href);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      // Handle route navigation
      router.push(href);
    }
  };

  return (
    <YStack backgroundColor="$gray1" minHeight="100vh" gap="$0">
      {/* Navigation */}
      <YStack width="100%" alignItems="center" paddingHorizontal="$6" paddingVertical="$4">
        <XStack
          width="100%"
          maxWidth={1440}
          alignItems="center"
          justifyContent="space-between"
          gap="$4"
        >
          <Heading level={3}>Jarvis</Heading>
          <ButtonGroup orientation="horizontal" wrap>
            <Button variant="ghost" size="sm" onClick={() => handleNavigation('/auth')}>
              Sign In
            </Button>
            <Button size="sm" onClick={() => handleNavigation('/auth')}>
              Get Started
            </Button>
          </ButtonGroup>
        </XStack>
      </YStack>

      {/* Hero */}
      <YStack width="100%" alignItems="center" paddingHorizontal="$6" paddingVertical="$9">
        <YStack maxWidth={960} alignItems="center" gap="$5">
          <Heading level={1} align="center">
            Intelligent Context for Academic Events
          </Heading>
          <Body size="lg" tone="muted" align="center">
            Real-time AI agents that understand your content, provide contextual insights, and enhance
            engagement for organizers and participants.
          </Body>
          <XStack gap="$3" flexWrap="wrap" justifyContent="center">
            {heroButtons.map((button) => (
              <Button
                key={button.label}
                variant={button.variant === 'outline' ? 'outline' : 'primary'}
                size="lg"
                onClick={() => handleNavigation(button.href)}
              >
                {button.label}
              </Button>
            ))}
          </XStack>
        </YStack>
      </YStack>

      {/* Features */}
      <YStack width="100%" alignItems="center" paddingHorizontal="$6" paddingVertical="$9" id="features">
        <YStack maxWidth={1100} alignItems="center" gap="$6">
          <Heading level={2} align="center">
            Powerful Features for Event Excellence
          </Heading>
          <XStack gap="$4" flexWrap="wrap" width="100%" justifyContent="center">
            {featureCards.map((feature) => (
              <Card
                key={feature.title}
                variant="outlined"
                flexBasis={320}
                flexGrow={1}
                padding="$5"
                gap="$2"
              >
                <Heading level={4}>{feature.title}</Heading>
                <Body tone="muted">{feature.description}</Body>
              </Card>
            ))}
          </XStack>
        </YStack>
      </YStack>

      {/* Use Cases */}
      <YStack width="100%" alignItems="center" backgroundColor="$gray2" paddingHorizontal="$6" paddingVertical="$9">
        <YStack maxWidth={1100} alignItems="center" gap="$4">
          <Heading level={2} align="center">
            Designed for Academic Excellence
          </Heading>
          <Body size="lg" tone="muted" align="center">
            Built for universities, research institutions, and professional conference organizers.
          </Body>
          <XStack gap="$3" flexWrap="wrap" justifyContent="center" width="100%">
            {useCases.map((useCase) => (
              <Card key={useCase} variant="outlined" padding="$4" alignItems="center" flexBasis={260}>
                <Text fontSize="$4" fontWeight="600" color="$color">
                  {useCase}
                </Text>
              </Card>
            ))}
          </XStack>
        </YStack>
      </YStack>

      {/* Call to action */}
      <YStack width="100%" alignItems="center" backgroundColor="$gray10" paddingHorizontal="$6" paddingVertical="$9">
        <YStack maxWidth={800} alignItems="center" gap="$4">
          <Heading level={2} color="$gray1" align="center">
            Ready to Transform Your Events?
          </Heading>
          <Body size="lg" tone="muted" align="center" color="$gray2">
            Join leading institutions using Jarvis to deliver exceptional event experiences.
          </Body>
          <Button size="lg" variant="primary" onClick={() => handleNavigation('/auth')}>
            Get Started Today
          </Button>
        </YStack>
      </YStack>

      {/* Footer */}
      <YStack width="100%" alignItems="center" backgroundColor="$gray9" paddingHorizontal="$6" paddingVertical="$5">
        <XStack
          width="100%"
          maxWidth={1440}
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

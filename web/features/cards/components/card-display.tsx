'use client';

import type { CardPayload } from '@/shared/types/card';
import { TextCard } from './text-card';
import { TextVisualCard } from './text-visual-card';
import { VisualCard } from './visual-card';

interface CardDisplayProps {
  card: CardPayload;
  timestamp?: string;
}

/**
 * Card Display Component
 * Renders the appropriate card component based on card_type
 */
export function CardDisplay({ card, timestamp }: CardDisplayProps) {
  const cardType = card.card_type || 'text';

  switch (cardType) {
    case 'text':
      return <TextCard card={card} timestamp={timestamp} />;
    
    case 'text_visual':
      return <TextVisualCard card={card} timestamp={timestamp} />;
    
    case 'visual':
      return <VisualCard card={card} timestamp={timestamp} />;
    
    default:
      // Fallback to text card
      return <TextCard card={card} timestamp={timestamp} />;
  }
}


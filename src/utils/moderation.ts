export interface ModerationDecision {
  allow: boolean;
  reason?: string;
  flaggedTerms?: string[];
}

const BLOCKED_TERMS = [
  'porn',
  'nude',
  'explicit',
  'sex',
  'drugs',
  'cocaine',
  'heroin',
  'weapon',
  'murder',
  'suicide',
  'terror',
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Lightweight moderation hook for MVP.
 * This can be replaced by Hugging Face / external moderation service later.
 */
export function moderateTextContent(title?: string, description?: string): ModerationDecision {
  const content = normalize(`${title || ''} ${description || ''}`);
  if (!content) {
    return { allow: true };
  }

  const flaggedTerms = BLOCKED_TERMS.filter((term) => content.includes(term));
  if (flaggedTerms.length > 0) {
    return {
      allow: false,
      reason: 'Icerik moderasyon kontrolune takildi',
      flaggedTerms,
    };
  }

  return { allow: true };
}


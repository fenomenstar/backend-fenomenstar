import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface ModerationDecision {
  allow: boolean;
  reason?: string;
  flaggedTerms?: string[];
  provider?: string;
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

function moderateLocally(title?: string, description?: string): ModerationDecision {
  const content = normalize(`${title || ''} ${description || ''}`);
  if (!content) {
    return { allow: true, provider: 'local' };
  }

  const flaggedTerms = BLOCKED_TERMS.filter((term) => content.includes(term));
  if (flaggedTerms.length > 0) {
    return {
      allow: false,
      reason: 'Icerik moderasyon kontrolune takildi',
      flaggedTerms,
      provider: 'local',
    };
  }

  return { allow: true, provider: 'local' };
}

async function moderateWithHuggingFace(title?: string, description?: string): Promise<ModerationDecision> {
  const content = `${title || ''} ${description || ''}`.trim();
  if (!content) {
    return { allow: true, provider: 'huggingface' };
  }

  if (!env.HUGGINGFACE_API_KEY) {
    logger.warn('Hugging Face moderation selected but API key is missing, falling back to local checks');
    return moderateLocally(title, description);
  }

  try {
    const response = await fetch(
      `https://api-inference.huggingface.co/models/${env.HUGGINGFACE_MODERATION_MODEL}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: content }),
      }
    );

    if (!response.ok) {
      throw new Error(`Hugging Face API returned ${response.status}`);
    }

    const data = await response.json() as Array<Array<{ label: string; score: number }>>;
    const labels = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];
    const blocked = labels.filter((item) => item.score >= 0.8 && /(toxic|hate|abuse|offensive)/i.test(item.label));

    if (blocked.length > 0) {
      return {
        allow: false,
        reason: 'Icerik harici moderasyon servisi tarafindan riskli bulundu',
        flaggedTerms: blocked.map((item) => `${item.label}:${item.score.toFixed(2)}`),
        provider: 'huggingface',
      };
    }

    return { allow: true, provider: 'huggingface' };
  } catch (error) {
    logger.error('Hugging Face moderation failed, falling back to local moderation', error);
    return moderateLocally(title, description);
  }
}

export async function moderateTextContent(title?: string, description?: string): Promise<ModerationDecision> {
  if (env.MODERATION_PROVIDER === 'huggingface') {
    return moderateWithHuggingFace(title, description);
  }

  return moderateLocally(title, description);
}

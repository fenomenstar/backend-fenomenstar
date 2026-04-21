import { env } from '../config/env';
import { logger } from '../utils/logger';

const EMBEDDING_DIMENSION = 1536;

type HuggingFaceEmbeddingResponse = number[] | number[][];

function averageTokenEmbeddings(tokens: number[][]): number[] {
  if (tokens.length === 0) {
    return [];
  }

  const width = tokens[0]?.length || 0;
  if (width === 0) {
    return [];
  }

  const acc = new Array<number>(width).fill(0);
  for (const token of tokens) {
    for (let i = 0; i < width; i += 1) {
      acc[i] += Number(token[i] || 0);
    }
  }

  return acc.map((value) => value / tokens.length);
}

function normalizeToFixedDimension(vector: number[], dimension: number = EMBEDDING_DIMENSION): number[] {
  const sanitized = vector.map((value) => Number.isFinite(value) ? Number(value) : 0);

  if (sanitized.length === dimension) {
    return sanitized;
  }

  if (sanitized.length > dimension) {
    return sanitized.slice(0, dimension);
  }

  return [...sanitized, ...new Array<number>(dimension - sanitized.length).fill(0)];
}

function parseEmbeddingResponse(payload: HuggingFaceEmbeddingResponse): number[] {
  if (Array.isArray(payload) && typeof payload[0] === 'number') {
    return normalizeToFixedDimension(payload as number[]);
  }

  if (Array.isArray(payload) && Array.isArray(payload[0])) {
    return normalizeToFixedDimension(averageTokenEmbeddings(payload as number[][]));
  }

  return new Array<number>(EMBEDDING_DIMENSION).fill(0);
}

export function formatVectorLiteral(vector: number[]): string {
  return `[${vector.map((value) => Number(value).toFixed(8)).join(',')}]`;
}

export async function generateTextEmbedding(text: string): Promise<number[] | null> {
  const content = text.trim();
  if (!content) {
    return null;
  }

  if (!env.HUGGINGFACE_API_KEY) {
    logger.warn('Semantic search requested but HUGGINGFACE_API_KEY is missing');
    return null;
  }

  try {
    const response = await fetch(
      `https://router.huggingface.co/hf-inference/models/${env.HUGGINGFACE_EMBEDDING_MODEL}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: content,
          options: { wait_for_model: true },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Hugging Face embeddings API returned ${response.status}`);
    }

    const payload = await response.json() as HuggingFaceEmbeddingResponse;
    return parseEmbeddingResponse(payload);
  } catch (error) {
    logger.error('Failed to generate embedding from Hugging Face', error);
    return null;
  }
}

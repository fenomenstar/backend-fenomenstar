import { pool, query } from '../config/database';
import { formatVectorLiteral, generateTextEmbedding } from '../services/embeddings.service';
import { buildUserEmbeddingText } from '../modules/users/user.service';
import { buildVideoEmbeddingText } from '../modules/videos/video.service';

async function backfillUsers() {
  const result = await query(
    `SELECT id, name, bio, city, talents, role
     FROM users
     WHERE is_active = true`
  );

  for (const row of result.rows) {
    const embedding = await generateTextEmbedding(buildUserEmbeddingText(row));
    if (!embedding) {
      continue;
    }

    await query(
      `UPDATE users
       SET search_embedding = $1::vector
       WHERE id = $2`,
      [formatVectorLiteral(embedding), row.id]
    );
  }
}

async function backfillVideos() {
  const result = await query(
    `SELECT id, title, description, category
     FROM videos
     WHERE status != 'deleted'`
  );

  for (const row of result.rows) {
    const embedding = await generateTextEmbedding(buildVideoEmbeddingText(row));
    if (!embedding) {
      continue;
    }

    await query(
      `UPDATE videos
       SET search_embedding = $1::vector
       WHERE id = $2`,
      [formatVectorLiteral(embedding), row.id]
    );
  }
}

async function main() {
  console.log('Backfilling user embeddings...');
  await backfillUsers();
  console.log('Backfilling video embeddings...');
  await backfillVideos();
  console.log('Embedding backfill complete.');
}

main()
  .catch((error) => {
    console.error('Embedding backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

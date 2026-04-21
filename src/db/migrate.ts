import { pool } from '../config/database';
import { schema } from './schema';
import { logger } from '../utils/logger';

async function migrate() {
  try {
    logger.info('Running database migrations...');
    await pool.query(schema);
    logger.info('Migrations completed successfully');
  } catch (err) {
    logger.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();

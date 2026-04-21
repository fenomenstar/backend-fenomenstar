import { query } from '../../config/database';
import { generateId } from '../../utils/crypto';
import { BadRequestError } from '../../utils/errors';
import { CreateReportInput } from './report.schema';
import { createNotification } from '../../services/notifications.service';

async function ensureTargetExists(targetType: CreateReportInput['targetType'], targetId: string) {
  if (targetType === 'user') {
    const result = await query('SELECT id FROM users WHERE id = $1 AND is_active = true', [targetId]);
    return result.rows.length > 0;
  }

  if (targetType === 'video') {
    const result = await query('SELECT id FROM videos WHERE id = $1 AND status != \'deleted\'', [targetId]);
    return result.rows.length > 0;
  }

  if (targetType === 'comment') {
    const result = await query('SELECT id FROM comments WHERE id = $1', [targetId]);
    return result.rows.length > 0;
  }

  return true;
}

export async function createReport(reporterId: string, input: CreateReportInput) {
  const targetExists = await ensureTargetExists(input.targetType, input.targetId);
  if (!targetExists) {
    throw new BadRequestError('Bildirilecek hedef bulunamadi');
  }

  const duplicate = await query(
    `SELECT id
     FROM reports
     WHERE reporter_id = $1 AND target_type = $2 AND target_id = $3 AND status IN ('open', 'reviewing')`,
    [reporterId, input.targetType, input.targetId]
  );

  if (duplicate.rows.length > 0) {
    return { alreadyReported: true, id: duplicate.rows[0].id };
  }

  const id = generateId();
  const result = await query(
    `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, reporterId, input.targetType, input.targetId, input.reason, input.details ?? '']
  );

  await createNotification({
    userId: reporterId,
    type: 'moderation',
    title: 'Bildirim alindi',
    body: 'Raporunuz incelenmek uzere sisteme kaydedildi.',
  }).catch(() => {});

  return { alreadyReported: false, report: result.rows[0] };
}

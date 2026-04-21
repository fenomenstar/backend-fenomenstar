import crypto from 'crypto';
import { PoolClient } from 'pg';
import { env } from '../../config/env';
import { getClient, query } from '../../config/database';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { createNotification } from '../../services/notifications.service';

export const COIN_PACKAGES = [
  {
    id: 'fc-20',
    productId: 'fc_20',
    type: 'fenomen_coin' as const,
    coins: 20,
    bonusCoins: 0,
    price: 15,
    label: 'Başlangıç Paketi',
    popular: false,
  },
  {
    id: 'fc-50',
    productId: 'fc_50',
    type: 'fenomen_coin' as const,
    coins: 50,
    bonusCoins: 5,
    price: 35,
    label: 'Yükseliş Paketi',
    popular: false,
  },
  {
    id: 'fc-100',
    productId: 'fc_100',
    type: 'fenomen_coin' as const,
    coins: 100,
    bonusCoins: 15,
    price: 65,
    label: 'Trend Paketi',
    popular: true,
  },
  {
    id: 'sc-10',
    productId: 'sc_10',
    type: 'star_coin' as const,
    coins: 10,
    bonusCoins: 0,
    price: 25,
    label: 'Yıldız Paketi',
    popular: false,
  },
  {
    id: 'sc-25',
    productId: 'sc_25',
    type: 'star_coin' as const,
    coins: 25,
    bonusCoins: 3,
    price: 55,
    label: 'Parıltı Paketi',
    popular: false,
  },
  {
    id: 'sc-50',
    productId: 'sc_50',
    type: 'star_coin' as const,
    coins: 50,
    bonusCoins: 8,
    price: 99,
    label: 'Sahne Paketi',
    popular: true,
  },
] as const;

export const DOPING_ITEMS = [
  {
    id: 'ses-kristali',
    name: 'Ses Kristali',
    description: 'Karaoke kayıtlarında ses netliğini artırır.',
    price: 5,
    currency: 'fenomen_coin' as const,
    duration: '24 saat',
    boost: '+50% ses kalitesi',
  },
  {
    id: 'video-boost',
    name: 'Video Boost',
    description: 'Videoları öne çıkan akışta daha görünür yapar.',
    price: 10,
    currency: 'fenomen_coin' as const,
    duration: '7 gün',
    boost: '+1 vitrin slotu',
  },
  {
    id: 'profil-shine',
    name: 'Profil Shine',
    description: 'Arama ve profil kartlarında öne çıkma sağlar.',
    price: 3,
    currency: 'star_coin' as const,
    duration: '3 gün',
    boost: '3x görünürlük',
  },
  {
    id: 'mega-doping-pack',
    name: 'Mega Doping Pack',
    description: 'Tek pakette görünürlük, profil ve karaoke desteği.',
    price: 15,
    currency: 'star_coin' as const,
    duration: '7 gün',
    boost: 'Tümü dahil',
  },
] as const;

export const GIFT_ITEMS = [
  {
    id: 'rose',
    name: 'Gül',
    description: 'Kısa destek hediyesi',
    price: 1,
    currency: 'fenomen_coin' as const,
    icon: 'rose-outline',
  },
  {
    id: 'heart',
    name: 'Kalp',
    description: 'Canlı yayın beğeni desteği',
    price: 2,
    currency: 'fenomen_coin' as const,
    icon: 'heart-outline',
  },
  {
    id: 'diamond',
    name: 'Elmas',
    description: 'Premium sahne hediyesi',
    price: 2,
    currency: 'star_coin' as const,
    icon: 'diamond-outline',
  },
  {
    id: 'rocket',
    name: 'Roket',
    description: 'Trend etkisi yüksek canlı yayın hediyesi',
    price: 5,
    currency: 'star_coin' as const,
    icon: 'rocket-outline',
  },
] as const;

type WalletClient = PoolClient | { query: typeof query };
type CoinCurrency = 'fenomen_coin' | 'star_coin';

function isGooglePlayConfigured() {
  return Boolean(
    env.GOOGLE_PLAY_PACKAGE_NAME &&
      env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL &&
      env.GOOGLE_PLAY_PRIVATE_KEY
  );
}

function getGooglePrivateKey() {
  if (!env.GOOGLE_PLAY_PRIVATE_KEY) {
    throw new BadRequestError('Google Play private key yapılandırılmadı');
  }

  return env.GOOGLE_PLAY_PRIVATE_KEY.replace(/\\n/g, '\n');
}

function getGoogleServiceAccountEmail() {
  if (!env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL) {
    throw new BadRequestError('Google Play servis hesabı yapılandırılmadı');
  }

  return env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL;
}

function getGooglePackageName() {
  if (!env.GOOGLE_PLAY_PACKAGE_NAME) {
    throw new BadRequestError('Google Play paket adı yapılandırılmadı');
  }

  return env.GOOGLE_PLAY_PACKAGE_NAME;
}

function base64UrlEncode(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createGoogleServiceJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: getGoogleServiceAccountEmail(),
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();

  const signature = signer.sign(getGooglePrivateKey());
  return `${unsignedToken}.${base64UrlEncode(signature)}`;
}

async function getGooglePlayAccessToken() {
  const assertion = createGoogleServiceJwt();
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw new BadRequestError('Google Play erişim anahtarı alınamadı');
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new BadRequestError('Google Play erişim anahtarı alınamadı');
  }

  return data.access_token;
}

async function fetchGooglePlayPurchase(input: {
  packageName: string;
  productId: string;
  purchaseToken: string;
}) {
  const accessToken = await getGooglePlayAccessToken();
  const verifyUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    input.packageName
  )}/purchases/products/${encodeURIComponent(input.productId)}/tokens/${encodeURIComponent(input.purchaseToken)}`;

  const response = await fetch(verifyUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new BadRequestError('Google Play satın alma kaydı doğrulanamadı');
  }

  const data = (await response.json()) as Record<string, unknown>;
  return { accessToken, data };
}

async function consumeGooglePlayPurchase(input: {
  packageName: string;
  productId: string;
  purchaseToken: string;
  accessToken: string;
}) {
  const consumeUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    input.packageName
  )}/purchases/products/${encodeURIComponent(input.productId)}/tokens/${encodeURIComponent(input.purchaseToken)}:consume`;

  const response = await fetch(consumeUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new BadRequestError('Google Play satın alma tüketimi tamamlanamadı');
  }
}

function normalizePackageId(value?: string) {
  if (!value) return '';
  return value.trim().toLowerCase().replace(/_/g, '-');
}

function findPackageByIdOrProductId(value?: string) {
  const normalized = normalizePackageId(value);
  return COIN_PACKAGES.find(
    (item) =>
      item.id === normalized ||
      normalizePackageId(item.productId) === normalized ||
      normalizePackageId(item.id) === normalized
  );
}

function getCoinColumn(currency: CoinCurrency) {
  return currency === 'fenomen_coin' ? 'fenomen_coins' : 'star_coins';
}

async function ensureWallet(client: WalletClient, userId: string) {
  await client.query(
    `INSERT INTO wallets (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

async function getWalletRow(client: WalletClient, userId: string) {
  await ensureWallet(client, userId);
  const result = await client.query(
    `SELECT user_id, fenomen_coins, star_coins, spent_try, updated_at
     FROM wallets
     WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Cüzdan bulunamadı');
  }

  return result.rows[0];
}

async function addWalletTransaction(
  client: WalletClient,
  input: {
    userId: string;
    paymentIntentId?: string | null;
    type: 'topup' | 'purchase' | 'gift_sent' | 'gift_received' | 'refund' | 'adjustment';
    status?: 'pending' | 'completed' | 'failed' | 'cancelled';
    title: string;
    description?: string;
    currency: 'TRY' | 'fenomen_coin' | 'star_coin';
    amount: number;
    balanceAfter?: number | null;
    provider?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await client.query(
    `INSERT INTO wallet_transactions
      (user_id, payment_intent_id, type, status, title, description, currency, amount, balance_after, provider, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
    [
      input.userId,
      input.paymentIntentId ?? null,
      input.type,
      input.status ?? 'completed',
      input.title,
      input.description ?? '',
      input.currency,
      input.amount,
      input.balanceAfter ?? null,
      input.provider ?? null,
      JSON.stringify(input.metadata ?? {}),
    ]
  );
}

async function applyTopup(client: PoolClient, paymentIntentId: string) {
  const paymentIntentRes = await client.query(
    `SELECT *
     FROM payment_intents
     WHERE id = $1
     FOR UPDATE`,
    [paymentIntentId]
  );

  const paymentIntent = paymentIntentRes.rows[0];
  if (!paymentIntent) {
    throw new NotFoundError('Ödeme kaydı bulunamadı');
  }

  if (paymentIntent.status === 'succeeded') {
    return paymentIntent;
  }

  const coinCurrency = paymentIntent.coin_currency as CoinCurrency | null;
  if (!coinCurrency) {
    throw new BadRequestError('Ödeme kaydı coin tipine sahip değil');
  }

  const coinColumn = getCoinColumn(coinCurrency);
  await ensureWallet(client, paymentIntent.user_id);

  const walletUpdate = await client.query(
    `UPDATE wallets
     SET ${coinColumn} = ${coinColumn} + $1,
         spent_try = spent_try + $2,
         updated_at = NOW()
     WHERE user_id = $3
     RETURNING *`,
    [paymentIntent.coin_amount + paymentIntent.bonus_coin_amount, paymentIntent.try_amount, paymentIntent.user_id]
  );

  const updatedWallet = walletUpdate.rows[0];

  await client.query(
    `UPDATE payment_intents
     SET status = 'succeeded',
         updated_at = NOW()
     WHERE id = $1`,
    [paymentIntent.id]
  );

  await addWalletTransaction(client, {
    userId: paymentIntent.user_id,
    paymentIntentId: paymentIntent.id,
    type: 'topup',
    title: `${paymentIntent.coin_amount + paymentIntent.bonus_coin_amount} ${coinCurrency === 'fenomen_coin' ? 'FenomenCoin' : 'StarCoin'} yüklendi`,
    description: `${paymentIntent.provider} üzerinden coin paketi tamamlandı.`,
    currency: coinCurrency,
    amount: paymentIntent.coin_amount + paymentIntent.bonus_coin_amount,
    balanceAfter: updatedWallet[coinColumn],
    provider: paymentIntent.provider,
    metadata: {
      packageId: paymentIntent.package_id,
      tryAmount: paymentIntent.try_amount,
      bonusCoinAmount: paymentIntent.bonus_coin_amount,
    },
  });

  return {
    ...paymentIntent,
    status: 'succeeded',
  };
}

async function applyRefund(
  client: PoolClient,
  paymentIntentId: string,
  reason: string,
  provider: string
) {
  const paymentIntentRes = await client.query(
    `SELECT *
     FROM payment_intents
     WHERE id = $1
     FOR UPDATE`,
    [paymentIntentId]
  );

  const paymentIntent = paymentIntentRes.rows[0];
  if (!paymentIntent) {
    throw new NotFoundError('Ödeme kaydı bulunamadı');
  }

  if (paymentIntent.status !== 'succeeded') {
    await client.query(
      `UPDATE payment_intents
       SET status = 'cancelled',
           updated_at = NOW()
       WHERE id = $1`,
      [paymentIntent.id]
    );
    return paymentIntent;
  }

  const coinCurrency = paymentIntent.coin_currency as CoinCurrency | null;
  if (!coinCurrency) {
    throw new BadRequestError('İade için coin tipi bulunamadı');
  }

  const coinColumn = getCoinColumn(coinCurrency);
  const refundAmount = Number(paymentIntent.coin_amount) + Number(paymentIntent.bonus_coin_amount);
  await ensureWallet(client, paymentIntent.user_id);

  const walletUpdate = await client.query(
    `UPDATE wallets
     SET ${coinColumn} = ${coinColumn} - $1,
         updated_at = NOW()
     WHERE user_id = $2
     RETURNING *`,
    [refundAmount, paymentIntent.user_id]
  );

  const updatedWallet = walletUpdate.rows[0];

  await client.query(
    `UPDATE payment_intents
     SET status = 'cancelled',
         updated_at = NOW()
     WHERE id = $1`,
    [paymentIntent.id]
  );

  await addWalletTransaction(client, {
    userId: paymentIntent.user_id,
    paymentIntentId: paymentIntent.id,
    type: 'refund',
    title: `${refundAmount} ${coinCurrency === 'fenomen_coin' ? 'FenomenCoin' : 'StarCoin'} iade edildi`,
    description: reason,
    currency: coinCurrency,
    amount: -refundAmount,
    balanceAfter: updatedWallet[coinColumn],
    provider,
    metadata: {
      packageId: paymentIntent.package_id,
      providerReference: paymentIntent.provider_reference,
    },
  });

  return {
    ...paymentIntent,
    status: 'cancelled',
  };
}

export async function getCatalog() {
  return {
    packages: COIN_PACKAGES,
    doping: DOPING_ITEMS,
    gifts: GIFT_ITEMS,
    providers: env.NODE_ENV === 'production' ? ['google_play'] : ['google_play', 'demo'],
  };
}

export async function getWalletSummary(userId: string) {
  const wallet = await getWalletRow({ query }, userId);
  const historyRes = await query(
    `SELECT id, type, status, title, description, currency, amount, balance_after, provider, created_at
     FROM wallet_transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 30`,
    [userId]
  );

  return {
    ...wallet,
    history: historyRes.rows,
  };
}

export async function createCheckout(
  userId: string,
  input: {
    packageId: string;
    provider?: string;
    platform?: string;
    providerReference?: string;
  }
) {
  const packageItem = COIN_PACKAGES.find((item) => item.id === input.packageId);
  if (!packageItem) {
    throw new BadRequestError('Coin paketi bulunamadı');
  }

  const provider = input.provider || 'demo';
  const client = await getClient();

  try {
    await client.query('BEGIN');
    await ensureWallet(client, userId);

    const insertResult = await client.query(
      `INSERT INTO payment_intents
        (user_id, package_id, provider, platform, type, currency, coin_currency, coin_amount, try_amount, bonus_coin_amount, provider_reference, checkout_url, metadata)
       VALUES ($1, $2, $3, $4, 'coin', 'TRY', $5, $6, $7, $8, $9, $10, $11::jsonb)
       RETURNING *`,
      [
        userId,
        packageItem.id,
        provider,
        input.platform || 'unknown',
        packageItem.type,
        packageItem.coins,
        packageItem.price,
        packageItem.bonusCoins ?? 0,
        input.providerReference ?? null,
        provider === 'demo' ? 'local://wallet/demo-checkout' : null,
        JSON.stringify({ label: packageItem.label ?? '', popular: packageItem.popular ?? false }),
      ]
    );

    const paymentIntent = insertResult.rows[0];

    if (provider === 'demo' || env.NODE_ENV !== 'production') {
      const applied = await applyTopup(client, paymentIntent.id);
      await client.query('COMMIT');
      return {
        paymentIntent: applied,
        mode: 'captured',
      };
    }

    await addWalletTransaction(client, {
      userId,
      paymentIntentId: paymentIntent.id,
      type: 'topup',
      status: 'pending',
      title: `${packageItem.label} ödeme bekliyor`,
      description: `${provider} üzerinden doğrulama bekleniyor.`,
      currency: 'TRY',
      amount: packageItem.price,
      provider,
      metadata: { packageId: packageItem.id },
    });

    await client.query('COMMIT');
    return {
      paymentIntent,
      mode: 'pending',
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function verifyGooglePlayPurchase(
  userId: string,
  input: {
    packageId?: string;
    productId: string;
    purchaseToken: string;
    orderId?: string;
    packageName?: string;
  }
) {
  if (!isGooglePlayConfigured()) {
    throw new BadRequestError('Google Play Billing henüz yapılandırılmadı');
  }

  if (!input.productId || !input.purchaseToken) {
    throw new BadRequestError('Google Play satın alma bilgileri eksik');
  }

  const configuredPackageName = getGooglePackageName();
  const packageName = input.packageName || configuredPackageName;
  if (packageName !== configuredPackageName) {
    throw new BadRequestError('Geçersiz uygulama paketi');
  }

  const packageItem =
    findPackageByIdOrProductId(input.packageId) ||
    findPackageByIdOrProductId(input.productId);

  if (!packageItem) {
    throw new BadRequestError('Coin paketi bulunamadı');
  }

  const duplicateRes = await query(
    `SELECT id, user_id, status
     FROM payment_intents
     WHERE provider = 'google_play'
       AND provider_reference = $1
     LIMIT 1`,
    [input.purchaseToken]
  );

  const existing = duplicateRes.rows[0];
  if (existing) {
    if (existing.user_id !== userId) {
      throw new ConflictError('Bu satın alma başka bir kullanıcıya ait');
    }

    return {
      duplicate: true,
      paymentIntentId: existing.id,
      status: existing.status,
      wallet: await getWalletSummary(userId),
    };
  }

  const { accessToken, data } = await fetchGooglePlayPurchase({
    packageName,
    productId: packageItem.productId,
    purchaseToken: input.purchaseToken,
  });

  const purchaseState = Number(data.purchaseState ?? -1);
  const consumptionState = Number(data.consumptionState ?? 0);
  const orderId = String(data.orderId ?? input.orderId ?? '');
  const verifiedProductId = String(data.productId ?? input.productId);

  if (verifiedProductId !== packageItem.productId) {
    throw new BadRequestError('Google Play ürün bilgisi eşleşmedi');
  }

  if (purchaseState !== 0) {
    throw new BadRequestError('Satın alma henüz tamamlanmadı');
  }

  if (consumptionState === 1) {
    throw new ConflictError('Bu satın alma daha önce tüketilmiş');
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');
    await ensureWallet(client, userId);

    const insertResult = await client.query(
      `INSERT INTO payment_intents
        (user_id, package_id, provider, platform, type, currency, coin_currency, coin_amount, try_amount, bonus_coin_amount, provider_reference, metadata, status)
       VALUES ($1, $2, 'google_play', 'android', 'coin', 'TRY', $3, $4, $5, $6, $7, $8::jsonb, 'pending')
       RETURNING *`,
      [
        userId,
        packageItem.id,
        packageItem.type,
        packageItem.coins,
        packageItem.price,
        packageItem.bonusCoins ?? 0,
        input.purchaseToken,
        JSON.stringify({
          productId: packageItem.productId,
          orderId,
          purchaseState,
          purchaseToken: input.purchaseToken,
          googlePurchase: data,
        }),
      ]
    );

    const paymentIntent = insertResult.rows[0];
    const applied = await applyTopup(client, paymentIntent.id);

    await client.query('COMMIT');

    await consumeGooglePlayPurchase({
      packageName,
      productId: packageItem.productId,
      purchaseToken: input.purchaseToken,
      accessToken,
    });

    return {
      paymentIntent: applied,
      wallet: await getWalletSummary(userId),
      orderId,
      provider: 'google_play',
      consumed: true,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function processGooglePlayRtdn(payload: Record<string, unknown>) {
  const encodedMessage = typeof payload.message === 'object' && payload.message
    ? (payload.message as { data?: string }).data
    : undefined;

  if (!encodedMessage) {
    throw new BadRequestError('RTDN mesajı alınamadı');
  }

  const decodedRaw = Buffer.from(encodedMessage, 'base64').toString('utf8');
  const decoded = JSON.parse(decodedRaw) as Record<string, any>;
  const eventType =
    decoded.oneTimeProductNotification?.notificationType != null
      ? `one_time_${decoded.oneTimeProductNotification.notificationType}`
      : decoded.voidedPurchaseNotification
      ? 'voided_purchase'
      : decoded.testNotification
      ? 'test'
      : 'unknown';

  const externalId: string | null =
    decoded.oneTimeProductNotification?.purchaseToken ||
    decoded.voidedPurchaseNotification?.purchaseToken ||
    decoded.version ||
    null;

  await query(
    `INSERT INTO payment_webhook_events (provider, event_type, external_id, payload, processed)
     VALUES ('google_play', $1, $2, $3::jsonb, false)`,
    [eventType, externalId, JSON.stringify(decoded)]
  );

  if (decoded.testNotification) {
    return { processed: true, type: 'test' };
  }

  if (decoded.voidedPurchaseNotification?.purchaseToken) {
    const paymentIntentRes = await query(
      `SELECT id
       FROM payment_intents
       WHERE provider = 'google_play'
         AND provider_reference = $1
       LIMIT 1`,
      [decoded.voidedPurchaseNotification.purchaseToken]
    );

    const paymentIntentId = paymentIntentRes.rows[0]?.id;
    if (!paymentIntentId) {
      return { processed: false, reason: 'payment_intent_not_found' };
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');
      await applyRefund(
        client,
        paymentIntentId,
        'Google Play iade / iptal bildirimi alındı.',
        'google_play'
      );
      await client.query(
        `UPDATE payment_webhook_events
         SET processed = true
         WHERE provider = 'google_play'
           AND external_id = $1`,
        [decoded.voidedPurchaseNotification.purchaseToken]
      );
      await client.query('COMMIT');
      return { processed: true, type: 'voided_purchase' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  await query(
    `UPDATE payment_webhook_events
     SET processed = true
     WHERE provider = 'google_play'
       AND external_id = $1`,
    [externalId]
  );

  return { processed: true, type: eventType };
}

export async function processWebhook(
  provider: string,
  payload: {
    eventType?: string;
    paymentIntentId?: string;
    providerReference?: string;
    status?: string;
    raw?: Record<string, unknown>;
  }
) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO payment_webhook_events (provider, event_type, external_id, payload, processed)
       VALUES ($1, $2, $3, $4::jsonb, false)`,
      [
        provider,
        payload.eventType || 'unknown',
        payload.providerReference ?? payload.paymentIntentId ?? null,
        JSON.stringify(payload.raw ?? payload),
      ]
    );

    let paymentIntentId = payload.paymentIntentId ?? null;
    if (!paymentIntentId && payload.providerReference) {
      const refResult = await client.query(
        `SELECT id
         FROM payment_intents
         WHERE provider_reference = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [payload.providerReference]
      );
      paymentIntentId = refResult.rows[0]?.id ?? null;
    }

    if (!paymentIntentId) {
      await client.query('COMMIT');
      return { processed: false, reason: 'payment_intent_not_found' };
    }

    if (payload.status && !['succeeded', 'completed', 'paid'].includes(payload.status)) {
      await client.query(
        `UPDATE payment_intents
         SET status = 'failed',
             updated_at = NOW()
         WHERE id = $1`,
        [paymentIntentId]
      );
      await client.query('COMMIT');
      return { processed: true, status: 'failed' };
    }

    const applied = await applyTopup(client, paymentIntentId);
    await client.query(
      `UPDATE payment_webhook_events
       SET processed = true
       WHERE provider = $1
         AND (external_id = $2 OR external_id = $3)`,
      [provider, payload.providerReference ?? null, paymentIntentId]
    );

    await client.query('COMMIT');
    return { processed: true, status: applied.status, paymentIntentId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function purchaseDoping(userId: string, itemId: string) {
  const item = DOPING_ITEMS.find((entry) => entry.id === itemId);
  if (!item) {
    throw new BadRequestError('Doping paketi bulunamadı');
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');
    const wallet = await getWalletRow(client, userId);
    const coinColumn = getCoinColumn(item.currency);
    const currentBalance = Number(wallet[coinColumn]);

    if (currentBalance < item.price) {
      throw new BadRequestError('Yetersiz coin bakiyesi');
    }

    const updatedWalletRes = await client.query(
      `UPDATE wallets
       SET ${coinColumn} = ${coinColumn} - $1,
           updated_at = NOW()
       WHERE user_id = $2
       RETURNING *`,
      [item.price, userId]
    );
    const updatedWallet = updatedWalletRes.rows[0];

    await client.query(
      `INSERT INTO doping_purchases (user_id, item_id, name, currency, price, boost, duration_label, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '7 days')`,
      [userId, item.id, item.name, item.currency, item.price, item.boost, item.duration]
    );

    await addWalletTransaction(client, {
      userId,
      type: 'purchase',
      title: `${item.name} etkinleştirildi`,
      description: `${item.duration} boyunca ${item.boost}.`,
      currency: item.currency,
      amount: -item.price,
      balanceAfter: updatedWallet[coinColumn],
      metadata: { itemId: item.id },
    });

    await client.query('COMMIT');
    return {
      success: true,
      wallet: updatedWallet,
      item,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function sendGift(
  senderId: string,
  input: {
    recipientId: string;
    giftId: string;
    streamId?: string;
    message?: string;
  }
) {
  if (senderId === input.recipientId) {
    throw new BadRequestError('Kendinize hediye gönderemezsiniz');
  }

  const gift = GIFT_ITEMS.find((entry) => entry.id === input.giftId);
  if (!gift) {
    throw new BadRequestError('Hediye bulunamadı');
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const recipient = await client.query(
      `SELECT id, name
       FROM users
       WHERE id = $1 AND is_active = true`,
      [input.recipientId]
    );
    if (recipient.rows.length === 0) {
      throw new NotFoundError('Hediye alıcısı bulunamadı');
    }

    const senderWallet = await getWalletRow(client, senderId);
    const recipientWallet = await getWalletRow(client, input.recipientId);
    const coinColumn = getCoinColumn(gift.currency);

    if (Number(senderWallet[coinColumn]) < gift.price) {
      throw new BadRequestError('Hediye için yeterli coin yok');
    }

    const senderWalletRes = await client.query(
      `UPDATE wallets
       SET ${coinColumn} = ${coinColumn} - $1,
           updated_at = NOW()
       WHERE user_id = $2
       RETURNING *`,
      [gift.price, senderId]
    );
    const senderUpdated = senderWalletRes.rows[0];

    const recipientWalletRes = await client.query(
      `UPDATE wallets
       SET ${coinColumn} = ${coinColumn} + $1,
           updated_at = NOW()
       WHERE user_id = $2
       RETURNING *`,
      [gift.price, input.recipientId]
    );
    const recipientUpdated = recipientWalletRes.rows[0];

    await client.query(
      `INSERT INTO gift_transactions (sender_id, recipient_id, stream_id, gift_id, gift_name, currency, amount, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [senderId, input.recipientId, input.streamId ?? null, gift.id, gift.name, gift.currency, gift.price, input.message ?? '']
    );

    await addWalletTransaction(client, {
      userId: senderId,
      type: 'gift_sent',
      title: `${gift.name} hediyesi gönderildi`,
      description: recipient.rows[0].name ? `${recipient.rows[0].name} kullanıcısına gönderildi.` : 'Canlı yayın desteği olarak gönderildi.',
      currency: gift.currency,
      amount: -gift.price,
      balanceAfter: senderUpdated[coinColumn],
      metadata: { giftId: gift.id, recipientId: input.recipientId, streamId: input.streamId ?? null },
    });

    await addWalletTransaction(client, {
      userId: input.recipientId,
      type: 'gift_received',
      title: `${gift.name} hediyesi alındı`,
      description: 'Canlı yayın veya profil etkileşimi üzerinden geldi.',
      currency: gift.currency,
      amount: gift.price,
      balanceAfter: recipientUpdated[coinColumn],
      metadata: { giftId: gift.id, senderId, streamId: input.streamId ?? null },
    });

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await createNotification({
    userId: input.recipientId,
    actorId: senderId,
    type: 'system',
    title: `${gift.name} hediyesi aldınız`,
    body: input.message?.trim()
      ? `Mesaj: ${input.message.trim()}`
      : 'Cüzdanınıza coin yansıtıldı.',
  }).catch(() => {});

  return {
    success: true,
    gift,
  };
}

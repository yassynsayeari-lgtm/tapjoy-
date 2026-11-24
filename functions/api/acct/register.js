
// POST /api/acct/register
// Authorization: Bearer <Google-signed-in Firebase ID token>
// body: {"number":"<account ID>","pin":"<6-digit PIN>","name":"Ali","methodId":"personal|none|<category id>","walletNumber":"optional"}

import {
  handler,
  json,
  HttpError,
  readJson,
  getDocMeta,
  commit,
  write,
  mustCommit,
  verifyIdToken,
  timingSafeEqual
} from '../../_lib/fb.js';

import {
  accountByUid,
  cleanNumber,
  cleanPin6,
  cleanText,
  pickMethod,
  isConflict
} from '../../_lib/vip.js';

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

export const onRequest = handler(async ({ request, env }) => {
  if (request.method !== 'POST') {
    throw new HttpError(405, 'Use POST');
  }

  const { uid, email } = await verifyIdToken(env, request);

  if (!uid || !email) {
    throw new HttpError(401, 'Please sign in with Google');
  }

  const b = await readJson(request);

  const number = cleanNumber(b.number);
  const pin = cleanPin6(b.pin);
  const name = cleanText(b.name, 2, 40, 'your name');

  const { method, walletNumber } = await pickMethod(
    env,
    b.methodId,
    b.walletNumber
  );

  if (await accountByUid(env, uid)) {
    throw new HttpError(
      409,
      'You already have an account on this Google account.'
    );
  }

  const path = `vipAccounts/${number}`;
  const slot = await getDocMeta(env, path);

  if (
    !slot ||
    slot.data.unclaimed !== true ||
    slot.data.googleUid
  ) {
    throw new HttpError(
      400,
      'This account ID is not valid or was already used'
    );
  }

  const now = Date.now();

  if (Number(slot.data.pinLockedUntil) > now) {
    const minutes = Math.ceil(
      (Number(slot.data.pinLockedUntil) - now) / 60000
    );

    throw new HttpError(
      429,
      `Too many wrong attempts. Try again in ${minutes} min`
    );
  }

  if (!slot.data.pin) {
    throw new HttpError(
      400,
      'This account ID has no PIN yet. Ask the admin to issue a PIN.'
    );
  }

  if (!timingSafeEqual(String(slot.data.pin), pin)) {
    const fails = (Number(slot.data.pinFails) || 0) + 1;
    const locked = fails >= MAX_FAILS;

    const result = await commit(env, [
      write(env, path, {
        set: [
          [['pinFails'], locked ? 0 : fails],
          [['pinLockedUntil'], locked ? now + LOCK_MS : 0]
        ],
        exists: true,
        updateTime: slot.updateTime
      })
    ]);

    if (isConflict(result)) {
      throw new HttpError(
        409,
        'The account was updated at the same time. Please try again.'
      );
    }

    mustCommit(result, 'Update PIN attempts');

    throw new HttpError(
      401,
      locked
        ? 'Too many wrong attempts. Locked for 15 minutes'
        : 'Wrong PIN for this Account ID'
    );
  }

  const result = await commit(env, [
    write(env, path, {
      set: [
        [['name'], name],
        [['method'], method.name],
        [['methodId'], method.id],
        [['walletNumber'], walletNumber],
        [['googleUid'], uid],
        [['googleEmail'], email],
        [['pinFails'], 0],
        [['pinLockedUntil'], 0],
        [['unclaimed'], false]
      ],
      ts: [['activatedAt']],
      updateTime: slot.updateTime
    })
  ]);

  if (result.ok) {
    return json({ ok: true, number });
  }

  if (isConflict(result)) {
    throw new HttpError(
      409,
      'This account ID was just used. Please check it.'
    );
  }

  mustCommit(result, 'Register');
});

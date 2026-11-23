// POST /api/vip/register   (Authorization: Bearer <Google-signed-in Firebase ID token>)
// body: {"name":"Ali","methodId":"personal|<category id>","walletNumber":"ID of the category (not needed for Personal)","password":"..."}
// Creates the VIP account for this Google user with an automatically generated private number.
import { handler, json, HttpError, readJson, commit, write, mustCommit, isAlreadyExists, verifyIdToken } from '../../_lib/fb.js';
import { accountByUid, cleanNewPassword, cleanText, hashPin, rid, pickMethod } from '../../_lib/vip.js';

export const onRequest = handler(async ({ request, env }) => {
  if (request.method !== 'POST') throw new HttpError(405, 'Use POST');
  const { uid, email } = await verifyIdToken(env, request);
  const b = await readJson(request);
  const name = cleanText(b.name, 2, 40, 'your name');
  const password = cleanNewPassword(b.password);
  const { method, walletNumber } = await pickMethod(env, b.methodId, b.walletNumber);
  if (await accountByUid(env, uid)) throw new HttpError(409, 'You already have an account. Sign in with your number and password.');
  const salt = rid();
  for (let i = 0; i < 12; i++) {
    const a = new Uint32Array(9); crypto.getRandomValues(a);
    const number = String(1 + (a[0] % 9)) + [...a.slice(1)].map((x) => x % 10).join('');
    const r = await commit(env, [write(env, `vipAccounts/${number}`, {
      set: [[['name'], name], [['method'], method.name], [['methodId'], method.id], [['walletNumber'], walletNumber], [['googleUid'], uid], [['googleEmail'], email],
        [['pinSalt'], salt], [['pinHash'], await hashPin(salt, password)], [['pinFails'], 0], [['pinLockedUntil'], 0], [['recovery'], ''],
        [['points'], 0], [['accounts'], 0], [['enabled'], true], [['banned'], false]],
      ts: [['createdAt']], exists: false,
    })]);
    if (r.ok) return json({ ok: true, number });
    if (!isAlreadyExists(r)) mustCommit(r, 'Register');
  }
  throw new HttpError(503, 'Could not create a number, please try again');
});

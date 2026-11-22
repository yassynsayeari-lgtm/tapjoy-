// POST /api/vip/transfer   body: {"number":"<third-app number>","pin":"<that account's PIN>"}   (Authorization: Bearer <user Firebase ID token>)
// Moves ALL of a VIP-enabled user's coins to a third-app (VIP) account. Atomic, server-side, cannot be forged by the client.
import { handler, json, HttpError, verifyIdToken, readJson, getDoc, getDocMeta, commit, write, mustCommit } from '../../_lib/fb.js';
import { cleanNumber, cleanPin, checkPin, suspension, suspendedError, usd, rid, vipSettings, isConflict } from '../../_lib/vip.js';

export const onRequest = handler(async ({ request, env }) => {
  if (request.method !== 'POST') throw new HttpError(405, 'Use POST');
  const { uid } = await verifyIdToken(env, request);
  const body = await readJson(request), number = cleanNumber(body.number), pin = cleanPin(body.pin);
  for (let attempt = 0; attempt < 4; attempt++) {
    const user = await getDocMeta(env, `users/${uid}`);
    if (!user) throw new HttpError(404, 'User not found');
    if (user.data.banned === true) throw new HttpError(403, 'This account is banned');
    if (user.data.vipAllowed !== true) throw new HttpError(403, 'IP withdrawal is not enabled for your account');
    if (!(await vipSettings(env)).enabled) throw new HttpError(403, 'IP withdrawal is currently unavailable');
    const acc = await getDoc(env, `vipAccounts/${number}`);
    if (!acc) throw new HttpError(404, 'This third-app IP was not found');
    const susp = suspension(acc); if (susp) throw suspendedError(susp);
    await checkPin(env, number, acc, pin);
    const bal = Math.floor(Number(user.data.balance) || 0);
    if (bal <= 0) throw new HttpError(400, 'You have no coins to transfer');
    const member = await getDoc(env, `vipAccounts/${number}/members/${uid}`);
    const id = rid(), pid = user.data.publicId || '';
    const r = await commit(env, [
      write(env, `users/${uid}`, { set: [[['balance'], 0], [['lastVipTransferId'], id]], updateTime: user.updateTime }),
      write(env, `vipAccounts/${number}`, { inc: [[['points'], bal], ...(member ? [] : [[['accounts'], 1]])], ts: [['updatedAt']], exists: true }),
      write(env, `vipAccounts/${number}/members/${uid}`, { set: [[['uid'], uid], [['publicId'], pid]], inc: [[['total'], bal]], ts: [['lastAt']] }),
      write(env, `vipTransfers/${id}`, { set: [[['number'], number], [['uid'], uid], [['publicId'], pid], [['points'], bal]], ts: [['createdAt']], exists: false }),
      write(env, `transactions/${id}`, { set: [[['uid'], uid], [['type'], 'vip_transfer'], [['coins'], -bal], [['number'], number]], ts: [['createdAt']], exists: false }),
    ]);
    if (r.ok) return json({ ok: true, transferred: bal, usd: usd(bal) });
    if (!isConflict(r)) mustCommit(r, 'Transfer');
  }
  throw new HttpError(409, 'Your balance changed during the transfer. Please try again.');
});

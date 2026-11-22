// POST /api/vip/withdraw   body: {"number":"...","pin":"...","points":10000,"details":"where to pay"}
// Creates a pending withdrawal request and holds the points (refunded if the admin rejects it).
import { handler, json, HttpError, readJson, getDocMeta, commit, write, mustCommit } from '../../_lib/fb.js';
import { authAccount, usd, rid, vipSettings, isConflict } from '../../_lib/vip.js';

export const onRequest = handler(async ({ request, env }) => {
  if (request.method !== 'POST') throw new HttpError(405, 'Use POST');
  const body = await readJson(request), { number } = await authAccount(env, body);
  const points = Number(body.points), details = String(body.details || '').trim();
  if (!Number.isInteger(points) || points <= 0) throw new HttpError(400, 'Enter a valid number of points');
  if (details.length < 4 || details.length > 200) throw new HttpError(400, 'Enter your payment details (4-200 characters)');
  const st = await vipSettings(env);
  if (points < st.minPoints) throw new HttpError(400, `The minimum withdrawal is ${st.minPoints.toLocaleString('en-US')} points (${usd(st.minPoints)})`);
  for (let attempt = 0; attempt < 4; attempt++) {
    const acc = await getDocMeta(env, `vipAccounts/${number}`);
    if (!acc || acc.data.enabled === false) throw new HttpError(404, 'Invalid number');
    const have = Math.floor(Number(acc.data.points) || 0);
    if (points > have) throw new HttpError(400, 'Not enough points');
    const id = rid();
    const r = await commit(env, [
      write(env, `vipAccounts/${number}`, { inc: [[['points'], -points]], ts: [['updatedAt']], updateTime: acc.updateTime }),
      write(env, `vipWithdrawals/${id}`, { set: [[['number'], number], [['name'], acc.data.name || ''], [['points'], points], [['details'], details], [['status'], 'pending']], ts: [['createdAt']], exists: false }),
    ]);
    if (r.ok) return json({ ok: true, id, points, usd: usd(points) });
    if (!isConflict(r)) mustCommit(r, 'Withdrawal');
  }
  throw new HttpError(409, 'The balance changed. Please try again.');
});

// POST /api/acct/register   (Authorization: Bearer <Google-signed-in Firebase ID token>)
// body: {"name":"Ali","methodId":"personal|none|<category id>","walletNumber":"(not needed for Personal/None)","pin":"<6 digits chosen by the user>"}
// Creates the VIP account automatically. The Account ID is generated here; the user only chooses a 6-digit PIN.
import { handler, json, HttpError, readJson, commit, write, mustCommit, verifyIdToken, isAlreadyExists } from '../../_lib/fb.js';
import { accountByUid, cleanPin6, cleanText, pickMethod } from '../../_lib/vip.js';

const newNumber = () => {
  const a = new Uint32Array(9); crypto.getRandomValues(a);
  return String(1 + (a[0] % 9)) + Array.from(a.slice(1), (x) => x % 10).join('');
};

export const onRequest = handler(async ({ request, env }) => {
  if (request.method !== 'POST') throw new HttpError(405, 'Use POST');
  const { uid, email } = await verifyIdToken(env, request);
  if (!email) throw new HttpError(401, 'Please sign in with Google');
  const b = await readJson(request);
  const pin = cleanPin6(b.pin);
  const name = cleanText(b.name, 2, 40, 'your name');
  const { method, walletNumber } = await pickMethod(env, b.methodId, b.walletNumber);
  if (await accountByUid(env, uid)) throw new HttpError(409, 'You already have an account on this Google account.');
  for (let i = 0; i < 12; i++) {
    const number = newNumber();
    const r = await commit(env, [write(env, `vipAccounts/${number}`, {
      set: [[['name'], name], [['method'], method.name], [['methodId'], method.id], [['walletNumber'], walletNumber],
        [['googleUid'], uid], [['googleEmail'], email], [['pin'], pin], [['points'], 0], [['accounts'], 0],
        [['enabled'], true], [['banned'], false], [['unclaimed'], false]],
      ts: [['createdAt'], ['activatedAt']], exists: false,
    })]);
    if (r.ok) return json({ ok: true, number });
    if (!isAlreadyExists(r)) mustCommit(r, 'Register');
  }
  throw new HttpError(503, 'Could not create the account, please try again');
});

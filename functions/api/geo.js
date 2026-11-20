// POST /api/geo  (Authorization: Bearer <Firebase ID token of the signed-in user>)
// Records the user's IP + country from Cloudflare (server side, cannot be spoofed by the app).
// - The FIRST country seen is stored as the fixed country.
// - If the account later connects from a different country it is banned automatically.
import { handler, json, HttpError, verifyIdToken, getDoc, write, commit, mustCommit, clientGeo, isMissing } from '../_lib/fb.js';

export const onRequest = handler(async ({ request, env }) => {
  if (request.method !== 'POST') throw new HttpError(405, 'Use POST');
  const { uid } = await verifyIdToken(env, request);
  const { ip, country } = clientGeo(request);
  const user = await getDoc(env, `users/${uid}`);
  if (!user) throw new HttpError(404, 'User document not found');
  if (!country && !ip) return json({ ok: true, skipped: true, banned: user.banned === true });

  const set = [], ts = [];
  let banned = user.banned === true, firstTime = false, rebased = false;

  if (country) {
    let name = '';
    try { name = new Intl.DisplayNames(['en'], { type: 'region' }).of(country) || ''; } catch (e) { /* optional */ }
    if (!user.countryCode) {
      // first detection => becomes the fixed country
      set.push([['countryCode'], country], [['lastCountryCode'], country], [['countrySrc'], 'cf']);
      if (name) set.push([['country'], name]);
      ts.push(['countryAt']);
      firstTime = true;
    } else if (user.countrySrc !== 'cf') {
      // country was recorded earlier by the app (third-party lookup): re-baseline once, never ban on this step
      set.push([['countryCode'], country], [['lastCountryCode'], country], [['countrySrc'], 'cf']);
      if (name) set.push([['country'], name]);
      ts.push(['countryAt']);
      rebased = true;
    } else if (user.countryCode !== country && user.banned !== true) {
      set.push([['banned'], true], [['banReason'], 'country_change'], [['bannedBy'], 'auto'],
        [['lastCountryCode'], country], [['previousCountryCode'], user.countryCode]);
      if (name) set.push([['lastCountry'], name]);
      ts.push(['bannedAt']);
      banned = true;
    }
  }
  if (ip && user.ip !== ip) {
    if (user.ip) set.push([['previousIp'], user.ip]);
    set.push([['ip'], ip]);
    ts.push(['ipAt']);
  }
  if (set.length || ts.length) {
    const r = await commit(env, [write(env, `users/${uid}`, { set, ts, exists: true })]);
    if (!r.ok && isMissing(r)) throw new HttpError(404, 'User document not found');
    mustCommit(r, 'Saving geo data');
  }
  return json({ ok: true, countryCode: user.countryCode || country || '', ip, banned, firstTime, rebased });
});

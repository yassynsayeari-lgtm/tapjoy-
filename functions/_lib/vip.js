// Shared helpers for the VIP (third app) endpoints.
import { getDoc, HttpError, timingSafeEqual } from './fb.js';

export const NUM_RE = /^\d{6,12}$/;
// 1 USD = 1000 points, always shown with 2 decimals (truncated to whole cents), e.g. 12500 -> $12.50
export const usd = (points) => {
  const cents = Math.floor(Math.max(0, Math.floor(Number(points) || 0)) / 10);
  return '$' + (cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};
export const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20);
export const cleanNumber = (v) => {
  const n = String(v == null ? '' : v).trim();
  if (!NUM_RE.test(n)) throw new HttpError(400, 'Invalid number');
  return n;
};
export async function vipSettings(env) {
  const s = (await getDoc(env, 'settings/vip')) || {};
  return { enabled: s.enabled !== false, minPoints: Math.max(1, Math.floor(Number(s.minPoints)) || 10000) };
}
export const tsMs = (v) => (v ? Date.parse(v) || 0 : 0);
export const byNewest = (a, b) => tsMs(b.createdAt) - tsMs(a.createdAt);
// Firestore commit conflicts (document changed between read and write) are retried by callers.
export const isConflict = (r) => r.status === 409 || r.status === 404 || (r.body && r.body.error && ['ABORTED', 'FAILED_PRECONDITION', 'NOT_FOUND'].includes(r.body.error.status));

// The third app signs in with the private number + the PIN that the admin gave that account.
export async function authAccount(env, body) {
  const number = cleanNumber(body && body.number), pin = String((body && body.pin) == null ? '' : body.pin).trim();
  const acc = await getDoc(env, `vipAccounts/${number}`);
  if (!acc || acc.enabled === false || !acc.pin || !timingSafeEqual(acc.pin, pin)) throw new HttpError(401, 'Wrong number or PIN');
  return { number, acc };
}

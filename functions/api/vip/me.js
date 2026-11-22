// POST /api/vip/me   body: {"number":"...","pin":"..."}   -> account summary, transfers, withdrawals and invoices for the third app.
// Number + PIN are the credentials.
import { handler, json, HttpError, readJson, queryEq } from '../../_lib/fb.js';
import { authAccount, usd, vipSettings, byNewest } from '../../_lib/vip.js';

export const onRequest = handler(async ({ request, env }) => {
  if (request.method !== 'POST') throw new HttpError(405, 'Use POST');
  const { number, acc } = await authAccount(env, await readJson(request));
  const [w, t, inv, st] = await Promise.all([
    queryEq(env, 'vipWithdrawals', 'number', number), queryEq(env, 'vipTransfers', 'number', number),
    queryEq(env, 'vipInvoices', 'number', number), vipSettings(env),
  ]);
  const pts = Math.floor(Number(acc.points) || 0);
  return json({
    ok: true,
    account: { number, name: acc.name || '', points: pts, usd: usd(pts), accounts: Number(acc.accounts) || 0, minPoints: st.minPoints, minUsd: usd(st.minPoints) },
    withdrawals: w.map((x) => ({ ...x.data, id: x.id })).sort(byNewest).slice(0, 100).map((x) => ({
      id: x.id, points: x.points, usd: usd(x.points), status: x.status || 'pending', details: x.details || '',
      createdAt: x.createdAt || '', paidAt: x.paidAt || '', invoiceNo: x.invoiceNo || '', reference: x.reference || '',
    })),
    transfers: t.map((x) => x.data).sort(byNewest).slice(0, 100).map((x) => ({ points: x.points, usd: usd(x.points), from: x.publicId || '', createdAt: x.createdAt || '' })),
    invoices: inv.map((x) => x.data).sort(byNewest).slice(0, 100).map((x) => ({ invoiceNo: x.invoiceNo || '', points: x.points, usd: usd(x.points), reference: x.reference || '', createdAt: x.createdAt || '' })),
  });
});

// POST /api/admin/assistant-delete   body: {"uid":"<assistant uid>"}   (Authorization: Bearer <admin Firebase ID token>)
// Deletes an admin-assistant: the adminAssistants/<uid> document AND the Firebase Auth login. Only the real admin may call it.
import { handler, json, HttpError, requireAdmin, readJson, isUid, commit, del, mustCommit, deleteAuthUser, DEFAULT_ADMIN_UID } from '../../_lib/fb.js';

export const onRequest = handler(async ({ request, env }) => {
  if (request.method !== 'POST') throw new HttpError(405, 'Use POST');
  await requireAdmin(env, request);
  const body = await readJson(request), uid = body && body.uid;
  if (!isUid(uid)) throw new HttpError(400, 'Invalid uid');
  if (uid === ((env && env.ADMIN_UID) || DEFAULT_ADMIN_UID)) throw new HttpError(400, 'The admin account cannot be deleted');
  mustCommit(await commit(env, [del(env, `adminAssistants/${uid}`)]), 'Deleting the assistant');
  let authDeleted = true, authError = '';
  try { await deleteAuthUser(env, uid); } catch (e) { authDeleted = false; authError = e.message; }
  return json({ ok: true, authDeleted, authError });
});

// Account API end-to-end test: node apitest.js
//
// Needs a real MongoDB, because it exercises the queries — not just the route
// wiring. Point MONGODB_URI at any server you can write to; the test forces its
// own database name (<db>-apitest) and drops it when it finishes, so it never
// touches your real data.
//
//   MONGODB_URI="mongodb://localhost:27017" node apitest.js
//
// Skips with a clear message (exit 0) when MONGODB_URI is unset, so it can sit
// in CI before anyone has provisioned a database.

import { spawn } from 'child_process';
import mongoose from 'mongoose';

const URI = (process.env.MONGODB_URI || '').trim();
if (!URI) {
  console.log('apitest: MONGODB_URI is not set — skipping the account API tests.');
  console.log('         Set it (plus JWT_SECRET) to run them.');
  process.exit(0);
}

const PORT = Number(process.env.APITEST_PORT) || 3998;
const BASE = `http://localhost:${PORT}/api`;
const DB = `${(process.env.MONGODB_DB || 'scrabble-live').replace(/-apitest$/, '')}-apitest`;
const SECRET = process.env.JWT_SECRET || 'apitest-secret-not-for-production';

let failures = 0;
const assert = (cond, msg) => {
  if (cond) console.log('  ✓', msg);
  else { console.error('  ✗', msg); failures++; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body && !raw) headers['content-type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  return { status: res.status, body: json, text };
}
const get = (p, o) => call('GET', p, o);
const post = (p, body, o) => call('POST', p, { ...o, body });
const patch = (p, body, o) => call('PATCH', p, { ...o, body });
const del = (p, o) => call('DELETE', p, o);

const server = spawn('node', ['index.js'], {
  env: { ...process.env, PORT: String(PORT), MONGODB_URI: URI, MONGODB_DB: DB, JWT_SECRET: SECRET },
  stdio: 'inherit',
});

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const health = await get('/health');
      if (health.body?.accounts) return true;
      if (health.status === 200 && attempt > 12) return false; // up, but no database
    } catch { /* not listening yet */ }
    await sleep(400);
  }
  return false;
}

const unique = Date.now().toString(36).slice(-5);
const alice = { name: `Ali_${unique}`, email: `ali_${unique}@example.com`, password: 'correct1horse' };
const bob = { name: `Bob_${unique}`, email: `bob_${unique}@example.com`, password: 'battery2staple' };

try {
  if (!(await waitForServer())) {
    console.error('apitest: server never reported a working database. Check MONGODB_URI.');
    process.exit(1);
  }

  // ── Registration ──
  const aliceReg = await post('/auth/register', alice);
  assert(aliceReg.status === 201 && aliceReg.body.token, 'register returns a token');
  assert(aliceReg.body.user.tag?.startsWith('SCR-'), `a tag is issued (${aliceReg.body.user.tag})`);
  assert(aliceReg.body.user.email === alice.email, 'your own profile shows your email');
  assert(aliceReg.body.user.stats.games === 0, 'a new account starts with empty stats');
  const aliceToken = aliceReg.body.token;

  const dupe = await post('/auth/register', { ...alice, email: `other_${unique}@example.com` });
  assert(dupe.status === 409, `a taken name is refused (${dupe.body?.error})`);
  const dupeEmail = await post('/auth/register', { ...alice, name: `Other_${unique}` });
  assert(dupeEmail.status === 409, `a taken email is refused (${dupeEmail.body?.error})`);
  const weak = await post('/auth/register', { name: `Weak_${unique}`, email: `w_${unique}@example.com`, password: 'abc' });
  assert(weak.status === 400, 'a weak password is refused');

  const bobReg = await post('/auth/register', bob);
  assert(bobReg.status === 201, 'a second account registers');
  const bobToken = bobReg.body.token;
  const bobId = bobReg.body.user.id;

  // ── Sign-in ──
  const byEmail = await post('/auth/login', { identifier: alice.email, password: alice.password });
  assert(byEmail.status === 200 && byEmail.body.token, 'login by email works');
  const byName = await post('/auth/login', { identifier: alice.name.toUpperCase(), password: alice.password });
  assert(byName.status === 200, 'login by name is case-insensitive');
  const wrong = await post('/auth/login', { identifier: alice.email, password: 'nope1234' });
  assert(wrong.status === 401, 'a wrong password is rejected');
  const ghost = await post('/auth/login', { identifier: `nobody_${unique}@example.com`, password: 'nope1234' });
  assert(ghost.status === 401 && ghost.body.error === wrong.body.error,
    'an unknown account gives the same message as a wrong password');

  const me = await get('/auth/me', { token: aliceToken });
  assert(me.status === 200 && me.body.user.name === alice.name, '/auth/me revives a stored token');
  assert((await get('/auth/me', { token: 'rubbish' })).status === 401, 'a forged token is rejected');
  assert((await get('/auth/me')).status === 401, 'no token means no profile');

  // ── Guests ──
  const guest = await post('/auth/guest', { name: `Vis_${unique}` });
  assert(guest.status === 201 && guest.body.user.isGuest === true, 'a guest account is created');
  const guestToken = guest.body.token;
  assert((await get('/friends', { token: guestToken })).status === 403, 'guests cannot use friends');

  const claim = await post('/auth/claim',
    { email: `claimed_${unique}@example.com`, password: 'claimed1pass' }, { token: guestToken });
  assert(claim.status === 200 && claim.body.user.isGuest === false, 'a guest can claim their account');
  assert(claim.body.user.id === guest.body.user.id, 'claiming keeps the same id, so history survives');

  // ── Search ──
  const byNameSearch = await get(`/users/search?q=${encodeURIComponent(bob.name)}`, { token: aliceToken });
  assert(byNameSearch.body.results.some((u) => u.id === bobId), 'search by name finds a player');
  assert(byNameSearch.body.results.every((u) => u.email === undefined), 'search never leaks emails');
  const byTag = await get(`/users/search?q=${bobReg.body.user.tag}`, { token: aliceToken });
  assert(byTag.body.matchedOn === 'tag' && byTag.body.results[0]?.id === bobId, 'search by tag finds a player');
  const byEmailSearch = await get(`/users/search?q=${encodeURIComponent(bob.email)}`, { token: aliceToken });
  assert(byEmailSearch.body.results[0]?.id === bobId, 'search by exact email finds a player');
  const byIdSearch = await get(`/users/search?q=${bobId}`, { token: aliceToken });
  assert(byIdSearch.body.results[0]?.id === bobId, 'search by id finds a player');
  const partialEmail = await get(`/users/search?q=${encodeURIComponent('@example.com')}`, { token: aliceToken });
  assert((partialEmail.body.results || []).length === 0, 'a partial email is not a directory lookup');
  const self = await get(`/users/search?q=${encodeURIComponent(alice.name)}`, { token: aliceToken });
  assert(!self.body.results.some((u) => u.name === alice.name), 'search never returns you');

  // ── Profile ──
  const edited = await patch('/users/me/profile', { bio: 'Plays the Q like it owes money.' }, { token: aliceToken });
  assert(edited.status === 200 && edited.body.user.bio.startsWith('Plays the Q'), 'the bio can be edited');
  const longBio = await patch('/users/me/profile', { bio: 'x'.repeat(200) }, { token: aliceToken });
  assert(longBio.status === 400, 'an over-long bio is refused');
  const takenName = await patch('/users/me/profile', { name: bob.name }, { token: aliceToken });
  assert(takenName.status === 409, 'you cannot rename onto a taken name');

  const publicView = await get(`/users/${bobId}`, { token: aliceToken });
  assert(publicView.body.user.email === undefined, "another player's email is never shown");

  // ── Friends ──
  const noSuch = await post('/friends/requests', { to: 'nobody-at-all' }, { token: aliceToken });
  assert(noSuch.status === 404, 'befriending a stranger who does not exist 404s');
  const self2 = await post('/friends/requests', { to: alice.name }, { token: aliceToken });
  assert(self2.status === 400, 'you cannot befriend yourself');

  const request = await post('/friends/requests', { to: bobReg.body.user.tag }, { token: aliceToken });
  assert(request.status === 201 && request.body.status === 'pending', 'a friend request is sent');
  const again = await post('/friends/requests', { to: bobId }, { token: aliceToken });
  assert(again.status === 409, 'the same request cannot be sent twice');

  const incoming = await get('/friends/requests', { token: bobToken });
  assert(incoming.body.incoming.length === 1, 'the request shows up for the recipient');
  const outgoing = await get('/friends/requests', { token: aliceToken });
  assert(outgoing.body.outgoing.length === 1, 'and as outgoing for the sender');

  const requestId = incoming.body.incoming[0].id;
  const notMine = await post(`/friends/requests/${requestId}/accept`, {}, { token: aliceToken });
  assert(notMine.status === 404, 'only the recipient can accept a request');
  const accepted = await post(`/friends/requests/${requestId}/accept`, {}, { token: bobToken });
  assert(accepted.status === 200 && accepted.body.status === 'accepted', 'the recipient accepts');
  assert((await post(`/friends/requests/${requestId}/accept`, {}, { token: bobToken })).status === 409,
    'a handled request cannot be handled twice');

  const aliceFriends = await get('/friends', { token: aliceToken });
  assert(aliceFriends.body.friends.some((f) => f.id === bobId), 'they appear in your friends list');
  assert(aliceFriends.body.friends[0].presence !== undefined, 'the friends list carries presence');
  const bobFriends = await get('/friends', { token: bobToken });
  assert(bobFriends.body.friends.length === 1, 'friendship is mutual');

  // ── Direct messages ──
  const dm = await post(`/messages/${bobId}`, { text: '  good   game  ' }, { token: aliceToken });
  assert(dm.status === 201 && dm.body.message.text === 'good game', 'a DM is sent and tidied');
  const thread = await get(`/messages/${bobId}`, { token: bobToken });
  assert(thread.body.messages.length === 1, 'the DM lands in the thread');
  const unreadAfterRead = await get('/messages/unread/count', { token: bobToken });
  assert(unreadAfterRead.body.unread === 0, 'opening a thread marks it read');
  const threads = await get('/messages', { token: aliceToken });
  assert(threads.body.threads[0]?.with.id === bobId, 'the thread list shows who you talked to');
  assert(threads.body.threads[0]?.last.mine === true, 'and whether the last line was yours');

  const empty = await post(`/messages/${bobId}`, { text: '   ' }, { token: aliceToken });
  assert(empty.status === 400, 'an empty DM is refused');

  // ── Unfriending closes the door on DMs ──
  assert((await del(`/friends/${bobId}`, { token: aliceToken })).status === 200, 'you can unfriend');
  assert((await get('/friends', { token: aliceToken })).body.friends.length === 0, 'the list empties');
  assert((await post(`/messages/${bobId}`, { text: 'still there?' }, { token: aliceToken })).status === 403,
    'you cannot DM someone who is no longer a friend');

  // ── Blocking ──
  assert((await post(`/friends/${bobId}/block`, {}, { token: aliceToken })).status === 200, 'you can block');
  assert((await post('/friends/requests', { to: bobId }, { token: bobToken })).status === 403,
    'a blocked player cannot send you a request');
  assert((await del(`/friends/${bobId}/block`, { token: aliceToken })).status === 200, 'and unblock');

  // ── Game history ──
  const history = await get('/games', { token: aliceToken });
  assert(history.status === 200 && Array.isArray(history.body.games), 'the history endpoint answers');
  assert(history.body.total === 0, 'a new account has no games yet');
  assert((await get('/games/notanid', { token: aliceToken })).status === 404, 'a bad game id 404s');
  assert((await get('/games/opponents/list', { token: aliceToken })).status === 200, 'the opponents list answers');

  // ── Dictionary needs no account ──
  const word = await get('/dictionary/lookup?q=scrabble');
  assert(word.status === 200 && word.body.valid === true, 'the dictionary works signed out');

  console.log(failures === 0 ? '\nAPI: all passed.' : `\nAPI: ${failures} FAILED.`);
} catch (err) {
  console.error('apitest crashed:', err);
  failures++;
} finally {
  // Drop only the throwaway database this run created.
  try {
    await mongoose.connect(URI, { dbName: DB, serverSelectionTimeoutMS: 8000 });
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    console.log(`(dropped test database ${DB})`);
  } catch (err) {
    console.error('Could not drop the test database:', err.message);
  }
  server.kill();
}

process.exit(failures === 0 ? 0 : 1);

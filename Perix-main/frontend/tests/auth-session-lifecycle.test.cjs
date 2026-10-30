const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness({ bootstrap = false, overrides = {} } = {}) {
  const storage = new Map();
  const states = [], refs = [], effects = [];
  let cursor = 0, first = true;
  const api = {
    loginUser: async () => ({ user: { user_id: 'reader', name: 'Reader' }, session_token: 'session-test' }),
    registerUser: async () => ({ user: { user_id: 'reader', name: 'Reader' }, session_token: 'session-test' }),
    getMe: async () => ({ user_id: 'reader', name: 'Reader' }),
    getMyBusinesses: async () => [{ business_id: 'business-test' }],
    getMyArtist: async () => null,
    logoutUser: async () => {},
    ...overrides,
  };
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    createElement: (_, props) => props.value,
    useState(value) {
      const index = cursor++;
      if (first) states[index] = value;
      return [states[index], next => { states[index] = next; }];
    },
    useRef(value) {
      const index = cursor++;
      if (first) refs[index] = { current: value };
      return refs[index];
    },
    useMemo: callback => callback(),
    useCallback: callback => callback,
    useEffect(callback) { if (first && bootstrap) effects.push(callback); },
  };
  const asyncStorage = {
    getItem: async key => storage.get(key) ?? null,
    setItem: async (key, value) => { storage.set(key, value); },
    removeItem: async key => { storage.delete(key); },
    multiRemove: async keys => { keys.forEach(key => storage.delete(key)); },
  };
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../context/AuthContext.tsx'), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require(name) {
      if (name === 'react') return react;
      if (name === '@react-native-async-storage/async-storage') return asyncStorage;
      if (name === '../lib/api') return api;
      if (name === 'react-native') return { Platform: { OS: 'web' } };
      if (name === 'expo-constants') return {};
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  function render() {
    cursor = 0;
    const value = module.exports.AuthProvider({ children: null });
    first = false;
    return value;
  }
  return { render, storage, effects, api, storageApi: asyncStorage };
}

test('logout clears the full local identity without waiting for remote revocation', async () => {
  const remote = deferred();
  const h = harness({ overrides: { logoutUser: () => remote.promise } });
  await h.render().login('reader@example.test', 'password');
  assert.equal(h.render().myBusinesses.length, 1);
  await h.render().logout();
  const value = h.render();
  assert.equal(value.user, null);
  assert.equal(value.sessionToken, null);
  assert.equal(value.activeIdentity, null);
  assert.equal(value.myBusinesses.length, 0);
  assert.equal(h.storage.size, 0);
  remote.reject(new Error('offline'));
  await flush();
  assert.equal(h.render().sessionToken, null);
});

test('late profile and business refreshes cannot restore a logged-out user', async () => {
  const h = harness();
  await h.render().login('reader@example.test', 'password');
  const profile = deferred(), businesses = deferred();
  h.api.getMe = () => profile.promise;
  h.api.getMyBusinesses = () => businesses.promise;
  const pending = [h.render().refreshUser(), h.render().refreshMyBusinesses()];
  await h.render().logout();
  profile.resolve({ user_id: 'reader' });
  businesses.resolve([{ business_id: 'stale-business' }]);
  await Promise.all(pending);
  assert.equal(h.render().user, null);
  assert.equal(h.render().myBusinesses.length, 0);
});

test('bootstrap and pending sign-in cannot resurrect a session after logout', async () => {
  const profile = deferred(), login = deferred();
  const h = harness({ bootstrap: true, overrides: { getMe: () => profile.promise, loginUser: () => login.promise } });
  h.storage.set('session_token', 'old-session');
  h.render();
  h.effects.forEach(effect => effect());
  await flush();
  const signingIn = h.render().login('reader@example.test', 'password');
  await flush();
  await h.render().logout();
  login.resolve({ user: { user_id: 'late-login' }, session_token: 'late-token' });
  profile.resolve({ user_id: 'late-bootstrap' });
  await signingIn;
  await flush();
  assert.equal(h.render().user, null);
  assert.equal(h.storage.size, 0);
});

test('a new login waits for old logout cookie cleanup, then installs the new session', async () => {
  const remote = deferred();
  let loginCalls = 0;
  const h = harness({ overrides: {
    logoutUser: () => remote.promise,
    loginUser: async () => { loginCalls++; return { user: { user_id: 'reader' }, session_token: 'fresh' }; },
  } });
  await h.render().logout();
  const pending = h.render().login('reader@example.test', 'password');
  await flush();
  assert.equal(loginCalls, 0);
  remote.resolve();
  await pending;
  assert.equal(h.render().sessionToken, 'fresh');
  assert.equal(h.storage.get('session_token'), 'fresh');
});

test('a token write already in progress is removed before logout completes', async () => {
  const writing = deferred();
  const h = harness();
  const write = h.storageApi.setItem;
  h.storageApi.setItem = async (...args) => { await writing.promise; await write(...args); };
  const login = h.render().login('reader@example.test', 'password');
  await flush();
  const logout = h.render().logout();
  writing.resolve();
  await Promise.all([login, logout]);
  assert.equal(h.storage.size, 0);
  assert.equal(h.render().user, null);
});

test('web confirmation resolves both confirm and cancel instead of using Alert.alert', async () => {
  let accepted = true;
  let prompts = 0;
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/confirm.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports,
    window: { confirm: () => { prompts++; return accepted; } },
    require: () => ({ Platform: { OS: 'web' }, Alert: { alert: () => { throw new Error('native Alert used on web'); } } }),
  });
  const options = { title: 'Logout', message: 'Confirm?' };
  assert.equal(await module.exports.confirmAction(options), true);
  accepted = false;
  assert.equal(await module.exports.confirmAction(options), false);
  assert.equal(prompts, 2);
});

test('recovery screens use an email link, confirm the password, and do not print reset tokens', () => {
  const root = path.join(__dirname, '../app/(auth)');
  const forgot = fs.readFileSync(path.join(root, 'forgot-password.tsx'), 'utf8');
  const reset = fs.readFileSync(path.join(root, 'reset-password.tsx'), 'utf8');
  assert.ok(!forgot.includes('reset_token'));
  assert.ok(reset.includes('newPassword !== confirmPassword'));
  assert.ok(reset.includes('!linkToken && <TextInput'));
  assert.ok(reset.includes('setToken(linkToken)'));
  for (const locale of ['el', 'en', 'de']) {
    const text = JSON.parse(fs.readFileSync(path.join(__dirname, `../i18n/locales/${locale}.json`), 'utf8'));
    for (const key of ['recoveryEmailIntro', 'recoveryEmailNotice', 'sendRecoveryLink', 'recoveryNewPasswordIntro', 'recoveryPasswordsMismatch', 'recoveryRequestNewLink']) {
      assert.ok(text.auth[key], `${locale}: ${key}`);
    }
  }
});

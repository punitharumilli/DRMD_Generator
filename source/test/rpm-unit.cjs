// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

// Requests-per-minute tracker (src/services/rateLimit.ts): limits are learned from the provider, not
// guessed, and a request that would exceed a known limit waits (or is refused within its time budget).
const path = require('path');
const esbuild = (() => { try { return require('esbuild'); } catch { return require(process.env.ESBUILD_PATH || '/opt/npm-tools/node_modules/esbuild'); } })();
const out = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../src/services/rateLimit.ts')], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'error' });
const mod = { exports: {} };
new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require);
const R = mod.exports;
const results = []; const check = (name, ok, extra = '') => { results.push([ok, name]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
const row = (model) => R.rpmSnapshot().find(r => r.model === model);

(async () => {
  const KEY = 'TEST-gemini-key-for-the-tracker-0123';
  // Gemini's 429 text as @google/genai passes it on (JSON in the message, quotes escaped)
  const geminiError = { status: 429, message: JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota',
    details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
      quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', quotaDimensions: { model: 'gemini-3.6-flash', location: 'global' }, quotaValue: '3' }] }] } }) };
  check('no limit known at first: a request goes at once', await R.waitForSlot('gemini', KEY, 'gemini-3.6-flash', 0) === true && !row('gemini-3.6-flash')?.limit);
  for (let i = 0; i < 4; i++) R.recordRequest('gemini', KEY, 'gemini-3.6-flash');
  R.learnFromRateLimit('gemini', KEY, 'gemini-3.6-flash', geminiError, false);
  check('the limit Gemini states in its 429 is learned (3 per minute)', row('gemini-3.6-flash')?.limit?.rpm === 3 && row('gemini-3.6-flash')?.limit?.source === 'quota', JSON.stringify(row('gemini-3.6-flash')));
  const t0 = Date.now();
  check('a 4th request within the minute does not fit into a short time budget', await R.waitForSlot('gemini', KEY, 'gemini-3.6-flash', 500) === false && Date.now() - t0 < 200);
  check('requests of the last minute are counted', row('gemini-3.6-flash').lastMinute === 4);

  // A per-day quota says nothing about requests per minute
  R.recordRequest('gemini', KEY, 'gemini-3.8-flash'); R.recordRequest('gemini', KEY, 'gemini-3.8-flash');
  R.learnFromRateLimit('gemini', KEY, 'gemini-3.8-flash', { status: 429, message: 'quota GenerateRequestsPerDayPerProjectPerModel exceeded' }, true);
  check('a daily quota is not taken as a per-minute limit', !row('gemini-3.8-flash')?.limit);
  // A token-per-minute 429 is not a request limit either
  R.learnFromRateLimit('gemini', KEY, 'gemini-3.8-flash', { status: 429, message: 'Input tokens per minute exceeded' }, false);
  check('a token-per-minute 429 is not taken as a request limit', !row('gemini-3.8-flash')?.limit);
  // No stated limit: the requests accepted in the minute before the 429
  R.recordRequest('openai', 'sk-test-xyz-0123456789', 'gpt-6-luna'); R.recordRequest('openai', 'sk-test-xyz-0123456789', 'gpt-6-luna'); R.recordRequest('openai', 'sk-test-xyz-0123456789', 'gpt-6-luna');
  R.learnFromRateLimit('openai', 'sk-test-xyz-0123456789', 'gpt-6-luna', { status: 429, message: 'Rate limit reached for requests' }, false);
  check('without a stated limit, the accepted requests of the last minute are taken (observed)', row('gpt-6-luna')?.limit?.rpm === 2 && row('gpt-6-luna').limit.source === 'observed');
  // Headers stated by the provider replace an observed limit
  R.learnFromHeaders('openai', 'sk-test-xyz-0123456789', 'gpt-6-luna', new Headers({ 'x-ratelimit-limit-requests': '500' }));
  check('rate-limit headers set the limit (x-ratelimit-limit-requests)', row('gpt-6-luna')?.limit?.rpm === 500 && row('gpt-6-luna').limit.source === 'headers');
  R.learnFromHeaders('anthropic', 'sk-ant-test-0123456789', 'claude-haiku-5-5', new Headers({ 'anthropic-ratelimit-requests-limit': '50' }));
  check('Anthropic headers set the limit (anthropic-ratelimit-requests-limit)', row('claude-haiku-5-5')?.limit?.rpm === 50);
  // A new run forgets observed limits only
  R.recordRequest('mistral', 'mistral-key-0123456789', 'mistral-medium-latest'); R.recordRequest('mistral', 'mistral-key-0123456789', 'mistral-medium-latest');
  R.learnFromRateLimit('mistral', 'mistral-key-0123456789', 'mistral-medium-latest', { status: 429, message: 'rate limit' }, false);
  const before = row('mistral-medium-latest')?.limit?.rpm;
  R.forgetObservedLimits('mistral-key-0123456789'); R.forgetObservedLimits(KEY);
  check('a new run forgets observed limits and keeps stated ones', before === 1 && !row('mistral-medium-latest')?.limit && row('gemini-3.6-flash')?.limit?.rpm === 3);
  // Waiting: with a limit of 2 and 2 requests just sent, the next one waits ~60 s; a 1-request window passes
  R.recordRequest('qwen', 'qwen-key-0123456789', 'qwen3.8-flash');
  R.learnFromHeaders('qwen', 'qwen-key-0123456789', 'qwen3.8-flash', new Headers({ 'x-ratelimit-limit-requests': '2' }));
  check('one request under the limit goes at once', await R.waitForSlot('qwen', 'qwen-key-0123456789', 'qwen3.8-flash', 0) === true);
  R.recordRequest('qwen', 'qwen-key-0123456789', 'qwen3.8-flash');
  let waited = null;
  const fits = await R.waitForSlot('qwen', 'qwen-key-0123456789', 'qwen3.8-flash', 100, (ms) => { waited = ms; });
  check('at the limit, the wait needed is about a minute (refused within a short budget)', fits === false && waited === null);
  check('API keys are not kept in the tracker', !JSON.stringify(R.rpmSnapshot()).includes(KEY) && !JSON.stringify(R.rpmSnapshot()).includes('sk-test'));

  const failed = results.filter(r => !r[0]).length;
  console.log(failed === 0 ? `\n${results.length}/${results.length} checks passed` : `\n${failed} of ${results.length} checks FAILED`);
  process.exit(failed ? 1 : 0);
})();

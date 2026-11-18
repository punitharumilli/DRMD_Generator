// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

// API keys in error texts (src/services/providers.ts): the key, and masked forms of it, must not reach
// the screen or the console, whether the error comes from providers.ts or from Google's SDK.
const path = require('path');
const esbuild = (() => { try { return require('esbuild'); } catch { return require(process.env.ESBUILD_PATH || '/opt/npm-tools/node_modules/esbuild'); } })();
const out = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../src/services/providers.ts')], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'error' });
const mod = { exports: {} };
new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require);
const { hideKey, hideKeyInError } = mod.exports;
const results = []; const check = (name, ok, extra = '') => { results.push([ok, name]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

const KEY = 'AIzaDummyKeyForTheUnitTestOnly';
check('the key is removed from a text', hideKey(`API key not valid: ${KEY}.`, KEY) === 'API key not valid: [key hidden].');
check('every occurrence is removed', !hideKey(`${KEY} ${KEY}`, KEY).includes(KEY));
check('a masked form is removed (OpenAI style)', hideKey('Incorrect API key provided: sk-proj-****wxyz.', KEY) === 'Incorrect API key provided: [key hidden].');
check('a text without the key stays as it is', hideKey('Model is overloaded (503).', KEY) === 'Model is overloaded (503).');
check('a key shorter than 8 characters is not used for replacing', hideKey('a b c', 'a') === 'a b c');

// An error as Google's SDK throws it: the error answer as JSON in the message; the stack repeats the message.
const err = new Error(JSON.stringify({ error: { code: 400, message: `API key not valid. Key: ${KEY}`, status: 'INVALID_ARGUMENT' } }));
err.status = 400;
hideKeyInError(err, KEY);
check('SDK error: the key is removed from the message', !err.message.includes(KEY) && err.message.includes('[key hidden]'));
check('SDK error: the key is removed from the stack', !String(err.stack).includes(KEY));
check('SDK error: other fields stay (status for the retry logic)', err.status === 400 && err.message.includes('INVALID_ARGUMENT'));
const frozen = Object.freeze(new Error(`x ${KEY}`));
let threw = false; try { hideKeyInError(frozen, KEY); } catch { threw = true; }
check('a read-only error does not break the error handling', !threw);
check('non-objects are ignored', (() => { try { hideKeyInError(undefined, KEY); hideKeyInError('text', KEY); return true; } catch { return false; } })());

const failed = results.filter(r => !r[0]).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

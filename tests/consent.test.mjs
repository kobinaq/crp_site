import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loader } from './helpers.mjs';
const load=loader();
const consent=load('lib/consent.ts');
const {CONSENT_COOKIE,CONSENT_MAX_AGE,COOKIE_INVENTORY,OPTIONAL_CATEGORIES,serializeConsent,parseConsent,allows}=consent;

test('consent cookie round-trips and lasts about 12 months',()=>{
 assert.equal(CONSENT_COOKIE,'crp-consent');
 assert.equal(CONSENT_MAX_AGE,365*24*60*60);
 const value=serializeConsent({functional:true},1760400000);
 assert.equal(value,'v1.functional-1.1760400000');
 assert.match(value,/^[\w.-]+$/,'cookie-safe without encoding');
 assert.deepEqual(parseConsent(value),{version:1,choices:{functional:true},at:1760400000});
 assert.deepEqual(parseConsent(serializeConsent({functional:false},5)).choices,{functional:false});
});

test('missing, malformed or outdated consent asks again',()=>{
 for(const value of [undefined,null,'','garbage','v0.functional-1.1','v1.functional-2.1','v1.analytics-1.1','v1.functional-1','v1.functional-1.x'])
  assert.equal(parseConsent(value),null,String(value));
});

test('only strictly necessary items are allowed before a choice',()=>{
 assert.equal(allows(null,'necessary'),true);
 for(const category of OPTIONAL_CATEGORIES)assert.equal(allows(null,category),false,category);
 assert.equal(allows(parseConsent('v1.functional-1.1'),'functional'),true);
 assert.equal(allows(parseConsent('v1.functional-0.1'),'functional'),false);
});

test('inventory covers every cookie the code sets, with translated copy',()=>{
 const names=COOKIE_INVENTORY.map((item)=>item.name);
 const {SESSION_COOKIE}=load('lib/session.ts');
 const {LOCALE_COOKIE}=load('lib/locale.ts');
 for(const name of [CONSENT_COOKIE,SESSION_COOKIE,LOCALE_COOKIE,'Cloudflare Turnstile'])assert.ok(names.includes(name),name);
 assert.equal(COOKIE_INVENTORY.find((item)=>item.name===LOCALE_COOKIE).category,'functional');
 for(const locale of ['en','fr','es','pt']){
  const ui=JSON.parse(readFileSync(`lib/translations/ui-${locale}.json`,'utf8'));
  for(const item of COOKIE_INVENTORY)for(const text of [item.purpose,item.duration])assert.ok(ui[text],`${locale}: ${text}`);
 }
});

test('the language cookie is only written with functional consent',()=>{
 const src=readFileSync('lib/locale.ts','utf8');
 assert.match(src,/persistLocale[\s\S]*?if \(!hasConsent\("functional"\)\) return;/);
 assert.doesNotMatch(src,/localStorage\.setItem/);
});

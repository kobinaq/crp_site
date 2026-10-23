import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loader } from './helpers.mjs';
const load=loader();
const consent=load('lib/consent.ts');
const {CONSENT_COOKIE,CONSENT_MAX_AGE,COOKIE_INVENTORY,OPTIONAL_CATEGORIES,NO_OPTIONAL,ALL_OPTIONAL,serializeConsent,parseConsent,allows}=consent;

// Minimal browser: a cookie jar honouring max-age=0, two storages, and window events.
function fakeBrowser(hostname='www.example.org'){
 const jar=new Map();
 const storage=()=>{const m=new Map();return{get length(){return m.size;},key:(i)=>[...m.keys()][i]??null,getItem:(k)=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:(k)=>m.delete(k)};};
 globalThis.document={get cookie(){return [...jar].map(([k,v])=>`${k}=${v}`).join('; ');},
  set cookie(raw){const [pair,...attrs]=raw.split('; ');const i=pair.indexOf('=');const name=pair.slice(0,i);
   if(attrs.some(a=>a==='max-age=0'))jar.delete(name);else jar.set(name,pair.slice(i+1));}};
 const win=Object.assign(new EventTarget(),{location:{hostname,protocol:'https:'},localStorage:storage(),sessionStorage:storage()});
 globalThis.window=win;return {jar,win};
}

test('consent cookie round-trips both categories and lasts about 12 months',()=>{
 assert.equal(CONSENT_COOKIE,'crp-consent');
 assert.equal(CONSENT_MAX_AGE,365*24*60*60);
 assert.deepEqual([...OPTIONAL_CATEGORIES],['functional','analytics']);
 const value=serializeConsent({functional:true,analytics:false},1760400000);
 assert.equal(value,'v2.functional-1.analytics-0.1760400000');
 assert.match(value,/^[\w.-]+$/,'cookie-safe without encoding');
 assert.deepEqual(parseConsent(value),{version:2,choices:{functional:true,analytics:false},at:1760400000});
 assert.deepEqual(parseConsent(serializeConsent(ALL_OPTIONAL,5)).choices,ALL_OPTIONAL);
 assert.deepEqual(parseConsent(serializeConsent(NO_OPTIONAL,5)).choices,NO_OPTIONAL);
});

test('missing, malformed, reordered or outdated consent asks again',()=>{
 for(const value of [undefined,null,'','garbage','v1.functional-1.1','v2.functional-1.1','v2.functional-2.analytics-0.1',
  'v2.analytics-1.functional-1.1','v2.functional-1.functional-1.1','v2.functional-1.analytics-1','v2.functional-1.analytics-1.','v2.functional-1.analytics-1.x'])
  assert.equal(parseConsent(value),null,String(value));
});

test('only strictly necessary items are allowed before a choice',()=>{
 assert.equal(allows(null,'necessary'),true);
 for(const category of OPTIONAL_CATEGORIES)assert.equal(allows(null,category),false,category);
 const c=parseConsent('v2.functional-0.analytics-1.1');
 assert.equal(allows(c,'analytics'),true);assert.equal(allows(c,'functional'),false);
});

test('hasConsent("analytics") follows the stored choice and onConsentChange notifies, then unsubscribes',()=>{
 const {jar}=fakeBrowser();
 assert.equal(consent.hasConsent('analytics'),false,'no choice yet');
 const seen=[];const off=consent.onConsentChange((c)=>seen.push(c.choices));
 consent.writeConsent({functional:false,analytics:true});
 assert.equal(consent.hasConsent('analytics'),true);assert.equal(consent.hasConsent('functional'),false);
 assert.match(jar.get('crp-consent'),/^v2\.functional-0\.analytics-1\.\d+$/);
 off();consent.writeConsent(NO_OPTIONAL);
 assert.deepEqual(seen,[{functional:false,analytics:true}],'one event before unsubscribing');
 assert.equal(consent.hasConsent('analytics'),false);
});

test('withdrawing analytics clears PostHog cookies and storage, keeps everything else',()=>{
 const {jar,win}=fakeBrowser();
 consent.writeConsent(ALL_OPTIONAL);
 jar.set('ph_phc_abc123_posthog','%7B%22distinct_id%22%7D');jar.set('__ph_opt_in_out_phc_abc123','1');jar.set('crp_session','x');
 win.localStorage.setItem('ph_phc_abc123_posthog','{}');win.localStorage.setItem('ph_phc_abc123_window_id','w');win.localStorage.setItem('other','keep');
 win.sessionStorage.setItem('ph_phc_abc123_primary_window_exists','true');
 consent.writeConsent({functional:true,analytics:false});
 assert.deepEqual([...jar.keys()].sort(),['crp-consent','crp-locale','crp_session'].filter(k=>jar.has(k)).sort());
 assert.ok(![...jar.keys()].some(k=>/ph_/.test(k)),'no ph_ cookies left');
 assert.equal(win.localStorage.length,1);assert.equal(win.localStorage.getItem('other'),'keep');
 assert.equal(win.sessionStorage.length,0);
});

test('withdrawing functional removes the language cookie',()=>{
 const {jar}=fakeBrowser();
 jar.set('crp-locale','fr');consent.writeConsent({functional:false,analytics:true});
 assert.equal(jar.has('crp-locale'),false);
});

test('inventory covers every cookie the code sets, with translated copy',()=>{
 const names=COOKIE_INVENTORY.map((item)=>item.name);
 const {SESSION_COOKIE}=load('lib/session.ts');
 const {LOCALE_COOKIE}=load('lib/locale.ts');
 for(const name of [CONSENT_COOKIE,SESSION_COOKIE,LOCALE_COOKIE,'Cloudflare Turnstile','ph_<project_key>_posthog','ph_*'])assert.ok(names.includes(name),name);
 assert.equal(COOKIE_INVENTORY.find((item)=>item.name===LOCALE_COOKIE).category,'functional');
 assert.ok(COOKIE_INVENTORY.filter((item)=>item.name.startsWith('ph_')).every((item)=>item.category==='analytics'));
 for(const locale of ['en','fr','es','pt']){
  const ui=JSON.parse(readFileSync(`lib/translations/ui-${locale}.json`,'utf8'));
  for(const item of COOKIE_INVENTORY)for(const text of [item.purpose,item.duration,...(item.label?[item.label]:[])])assert.ok(ui[text],`${locale}: ${text}`);
  for(const text of ['Analytics','Helps us see how people use the site so we can improve it','About 1 year'])assert.ok(ui[text],`${locale}: ${text}`);
 }
});

test('the language cookie is only written with functional consent',()=>{
 const src=readFileSync('lib/locale.ts','utf8');
 assert.match(src,/persistLocale[\s\S]*?if \(!hasConsent\("functional"\)\) return;/);
 assert.doesNotMatch(src,/localStorage\.setItem/);
});

test('the analytics SDK is a dependency loaded only by the consent-gated provider',()=>{
 const pkg=JSON.parse(readFileSync('package.json','utf8'));
 assert.ok(pkg.dependencies['posthog-js']);
 assert.doesNotMatch(readFileSync('lib/consent.ts','utf8'),/from ["']posthog-js|import\(["']posthog-js/);
});

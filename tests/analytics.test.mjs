import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { loader } from './helpers.mjs';
const load=loader();
const {createAnalytics,posthogOptions,scrubUrl,scrubEvent,stampEnvironment,analyticsEnvironment,DEFAULT_POSTHOG_HOST}=load('lib/analytics.ts');

function fakeBrowser(){
 const jar=new Map();
 const storage=()=>{const m=new Map();return{get length(){return m.size;},key:(i)=>[...m.keys()][i]??null,getItem:(k)=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:(k)=>m.delete(k)};};
 globalThis.document={get cookie(){return [...jar].map(([k,v])=>`${k}=${v}`).join('; ');},
  set cookie(raw){const [pair,...attrs]=raw.split('; ');const i=pair.indexOf('=');const name=pair.slice(0,i);
   if(attrs.some(a=>a==='max-age=0'))jar.delete(name);else jar.set(name,pair.slice(i+1));}};
 globalThis.window=Object.assign(new EventTarget(),{location:{hostname:'www.example.org',protocol:'https:'},localStorage:storage(),sessionStorage:storage()});
 return {jar};
}
// Records calls; opt-in state behaves like posthog-js (reset() returns to the opted-out default).
function fakePostHog(){
 const calls=[];let optedIn=false;let props={};
 const ph={calls,
  init:(key,options)=>{calls.push(['init',key,options]);document.cookie=`ph_${key}_posthog=x; path=/`;window.localStorage.setItem(`ph_${key}_posthog`,'{}');},
  has_opted_in_capturing:()=>optedIn,
  opt_in_capturing:(o)=>{optedIn=true;calls.push(['opt_in',o]);},
  opt_out_capturing:()=>{optedIn=false;calls.push(['opt_out']);},
  register:(p)=>{calls.push(['register',p,optedIn]);props={...props,...p};},
  reset:()=>{optedIn=false;props={};calls.push(['reset']);window.sessionStorage.setItem('ph_x_window_id','w');},
  get optedIn(){return optedIn;},get props(){return props;}};
 return ph;
}
const names=(ph)=>ph.calls.map(c=>c[0]);

test('nothing is loaded before analytics consent',async()=>{
 fakeBrowser();let loads=0;const ph=fakePostHog();
 const a=createAnalytics({key:'phc_dummy',host:DEFAULT_POSTHOG_HOST,load:async()=>{loads++;return ph;}});
 await a.sync(false);await a.sync(false);
 assert.equal(loads,0);assert.deepEqual(ph.calls,[]);
});

test('grant: init once with the configured options, then opt in without an extra event',async()=>{
 fakeBrowser();let loads=0;const ph=fakePostHog();
 const a=createAnalytics({key:'phc_dummy',host:'https://us.i.posthog.com',load:async()=>{loads++;return ph;}});
 await a.sync(true);await a.sync(true);
 assert.equal(loads,1);assert.deepEqual(names(ph),['init','opt_in','register','register']);
 assert.equal(ph.calls[0][1],'phc_dummy');assert.equal(ph.calls[0][2].api_host,'https://us.i.posthog.com');
 assert.deepEqual(ph.calls[1][1],{captureEventName:false});assert.equal(ph.optedIn,true);
});

test('withdrawal: opt out, reset, and delete ph_* cookies and storage',async()=>{
 const {jar}=fakeBrowser();const ph=fakePostHog();
 const a=createAnalytics({key:'phc_dummy',host:DEFAULT_POSTHOG_HOST,load:async()=>ph});
 await a.sync(true);window.localStorage.setItem('keep','1');document.cookie='crp-consent=v2.functional-0.analytics-0.1; path=/';
 assert.ok(jar.has('ph_phc_dummy_posthog'));
 await a.sync(false);
 assert.deepEqual(names(ph),['init','opt_in','register','opt_out','reset']);assert.equal(ph.optedIn,false);
 assert.deepEqual([...jar.keys()],['crp-consent']);
 assert.equal(window.localStorage.getItem('ph_phc_dummy_posthog'),null);assert.equal(window.sessionStorage.length,0);
 assert.equal(window.localStorage.getItem('keep'),'1');
 await a.sync(true);assert.deepEqual(names(ph).slice(5),['opt_in','register'],'re-grant opts in again without a second init');
});

test('a quick grant then withdrawal ends opted out',async()=>{
 fakeBrowser();const ph=fakePostHog();let release;
 const a=createAnalytics({key:'k',host:DEFAULT_POSTHOG_HOST,load:()=>new Promise(r=>{release=()=>r(ph);})});
 // Withdrawn before apply() even ran: nothing is loaded at all.
 await Promise.all([a.sync(true),a.sync(false)]);assert.equal(release,undefined);
 // Withdrawn while the SDK is still downloading: it is initialised opted out and stays so.
 const first=a.sync(true);await new Promise(r=>setTimeout(r,0));assert.equal(typeof release,'function');
 const second=a.sync(false);release();await first;await second;
 assert.equal(ph.optedIn,false);assert.ok(!names(ph).includes('opt_in'));assert.deepEqual(names(ph),['init','opt_out','reset']);
});

test('a failing SDK load never throws into the page',async()=>{
 fakeBrowser();const a=createAnalytics({key:'k',host:DEFAULT_POSTHOG_HOST,load:async()=>{throw new Error('blocked');}});
 await assert.doesNotReject(a.sync(true));
});

test('init options follow the privacy requirements',()=>{
 const o=posthogOptions('https://us.i.posthog.com');
 assert.equal(o.api_host,'https://us.i.posthog.com');assert.equal(o.person_profiles,'identified_only');
 assert.equal(o.capture_pageview,'history_change');assert.equal(o.capture_pageleave,true);
 assert.equal(o.disable_session_recording,true);assert.equal(o.session_recording.maskAllInputs,true);assert.equal(o.mask_all_text,false);
 assert.equal(o.persistence,'localStorage+cookie');assert.equal(o.opt_out_capturing_by_default,true);assert.equal(o.opt_out_persistence_by_default,true);
 assert.equal(o.advanced_disable_flags,true);assert.equal(o.disable_surveys,true);assert.equal(o.disable_external_dependency_loading,true);
 assert.equal(DEFAULT_POSTHOG_HOST,'https://us.i.posthog.com');
});

test('URLs sent to PostHog keep only utm_* parameters',()=>{
 assert.equal(scrubUrl('https://x.org/en/apply?token=abc&utm_source=ig#me'),'https://x.org/en/apply?utm_source=ig');
 assert.equal(scrubUrl('https://x.org/api/apply/resume?token=s3cret&lang=fr'),'https://x.org/api/apply/resume');
 assert.equal(scrubUrl('/relative?token=1'),'/relative?token=1');assert.equal(scrubUrl(4),4);
 const e=scrubEvent({event:'$pageview',properties:{$current_url:'https://x.org/a?email=a@b.c',$referrer:'$direct',other:'?token=1'},$set_once:{$initial_current_url:'https://x.org/?t=1'}});
 assert.equal(e.properties.$current_url,'https://x.org/a');assert.equal(e.properties.$referrer,'$direct');assert.equal(e.properties.other,'?token=1');
 assert.equal(e.$set_once.$initial_current_url,'https://x.org/');
});

test('posthog-js is only ever imported lazily, and identify is never called',()=>{
 const files=[];const walk=(d)=>{for(const f of readdirSync(d)){const p=path.join(d,f);if(statSync(p).isDirectory())walk(p);else if(/\.(ts|tsx)$/.test(f))files.push(p);}};
 for(const d of ['app','components','lib'])walk(d);
 for(const f of files){const s=readFileSync(f,'utf8');
  assert.doesNotMatch(s,/^import(?!\s+type)[^;]*from\s+["']posthog-js/m,`${f}: static posthog-js import`);
  assert.doesNotMatch(s,/\.identify\(|\.alias\(|\.people\./,`${f}: identify/alias`);}
 const provider=readFileSync('components/analytics/PostHogProvider.tsx','utf8');
 assert.match(provider,/import\("posthog-js"\)/);assert.match(provider,/hasConsent\("analytics"\)/);assert.match(provider,/if \(!KEY\) return;/);
 assert.match(readFileSync('.env.example','utf8'),/^NEXT_PUBLIC_POSTHOG_HOST=https:\/\/us\.i\.posthog\.com$/m);
});

test('environment super property: Vercel env, else development',()=>{
 assert.equal(analyticsEnvironment('preview'),'preview');assert.equal(analyticsEnvironment('production'),'production');
 assert.equal(analyticsEnvironment(undefined),'development');assert.equal(analyticsEnvironment(''),'development');
});

test('environment is registered after every opt-in, survives withdraw/re-grant, never while opted out',async()=>{
 fakeBrowser();const ph=fakePostHog();
 const a=createAnalytics({key:'k',host:DEFAULT_POSTHOG_HOST,load:async()=>ph,environment:'preview'});
 await a.sync(false);assert.deepEqual(ph.calls,[],'nothing before consent');
 await a.sync(true);assert.deepEqual(ph.props,{environment:'preview'});
 await a.sync(false);assert.deepEqual(ph.props,{},'reset() cleared it');
 await a.sync(false);
 await a.sync(true);assert.deepEqual(ph.props,{environment:'preview'},'registered again after reset');
 const registers=ph.calls.filter(c=>c[0]==='register');
 assert.equal(registers.length,2);
 for(const [, p, optedIn] of registers){assert.deepEqual(p,{environment:'preview'});assert.equal(optedIn,true,'only while opted in');}
 // Withdrawn while loading: never opted in, so never registered.
 const ph2=fakePostHog();let release;const b=createAnalytics({key:'k',host:DEFAULT_POSTHOG_HOST,load:()=>new Promise(r=>{release=()=>r(ph2);}),environment:'preview'});
 const g=b.sync(true);await new Promise(r=>setTimeout(r,0));const w=b.sync(false);release();await g;await w;
 assert.ok(!names(ph2).includes('register'));
});

test('before_send adds environment to events that lack it (the opt-in pageview) without overriding',()=>{
 const stamp=stampEnvironment('preview');
 assert.equal(stamp({event:'$pageview',properties:{}}).properties.environment,'preview');
 assert.equal(stamp({event:'x',properties:{environment:'production'}}).properties.environment,'production');
 assert.equal(stamp(null),null);
 const o=posthogOptions(DEFAULT_POSTHOG_HOST,'preview');assert.ok(Array.isArray(o.before_send));
 const out=o.before_send.reduce((e,f)=>f(e),{event:'$pageview',properties:{$current_url:'https://x.org/a?token=1'}});
 assert.deepEqual(out.properties,{$current_url:'https://x.org/a',environment:'preview'});
 assert.match(readFileSync('components/analytics/PostHogProvider.tsx','utf8'),/analyticsEnvironment\(process\.env\.NEXT_PUBLIC_VERCEL_ENV\)/);
});

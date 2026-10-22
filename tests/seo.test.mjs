import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loader } from './helpers.mjs';
const load=loader();
const {locales,localePath}=load('lib/locale.ts');
const {messages}=load('lib/messages.ts');
const {pageMetadata,pagePaths,SITE_URL,structuredData}=load('lib/seo.ts');
function leaves(value,prefix='') {
  return Object.entries(value).flatMap(([key,item])=>typeof item==='string'?[[`${prefix}${key}`,item]]:leaves(item,`${prefix}${key}.`));
}
test('every public language has complete copy, array items, and matching interpolation variables',()=>{
 const english=leaves(messages.en);
 for(const locale of locales){
  const translated=leaves(messages[locale]);
  assert.deepEqual(translated.map(([key])=>key).sort(),english.map(([key])=>key).sort(),locale);
  const byKey=new Map(translated);
  for(const [key,text]of english)assert.deepEqual((byKey.get(key).match(/\{\w+\}/g)||[]).sort(),(text.match(/\{\w+\}/g)||[]).sort(),`${locale}:${key}`);
  const ui=JSON.parse(readFileSync(`lib/translations/ui-${locale}.json`,'utf8'));
  assert.deepEqual(Object.keys(ui).sort(),Object.keys(JSON.parse(readFileSync('lib/translations/ui-en.json','utf8'))).sort());
 }
});
test('language links preserve public paths and query fragments without changing private or external URLs',()=>{
 assert.equal(localePath('/fr/programs?intent=apply#details','es'),'/es/programs?intent=apply#details');
 assert.equal(localePath('/','pt'),'/pt');
 for(const href of ['/api/apply/resume?token=secret','/apply/continue','/images/photo.jpg','//elsewhere.invalid','https://elsewhere.invalid'])assert.equal(localePath(href,'es'),href);
});
test('every public page has its own canonical, reciprocal alternatives and translated social metadata',()=>{
 for(const locale of locales)for(const [page,path]of Object.entries(pagePaths)){
  const meta=pageMetadata({locale,messages:messages[locale]},page);
  assert.equal(meta.alternates.canonical,SITE_URL+localePath(path,locale));
  assert.equal(meta.robots.index,true);
  assert.equal(meta.title,messages[locale].meta[page].title);
  assert.equal(meta.openGraph.url,meta.alternates.canonical);
  for(const other of locales)assert.equal(meta.alternates.languages[other],SITE_URL+localePath(path,other));
  assert.equal(meta.alternates.languages['x-default'],SITE_URL+localePath(path,'en'));
  const graph=structuredData({locale,messages:messages[locale]},page)['@graph'];
  assert.equal(graph.find(row=>row['@type']==='WebPage').inLanguage,locale);
  assert.equal(graph.some(row=>row['@type']==='LocalBusiness'),false);
 }
});
test('sitemap lists all language pages and excludes account and API routes',()=>{
 const entries=load('app/sitemap.ts').default();
 assert.equal(entries.length,locales.length*Object.keys(pagePaths).length);
 assert.equal(new Set(entries.map(row=>row.url)).size,entries.length);
 assert.ok(entries.every(row=>!row.url.includes('/api/')&&!row.url.includes('/continue')&&!row.url.includes('/confirmation')));
 const robots=load('app/robots.ts').default();
 assert.equal(robots.sitemap,`${SITE_URL}/sitemap.xml`);
 assert.ok(robots.rules.disallow.includes('/api/'));
 assert.ok(robots.rules.disallow.includes('/admin'));
});
test('Spanish application emails stay Spanish and escape applicant names',()=>{
 const email=load('lib/emails.ts');
 const confirmation=email.applicationEmail('<script>bad</script>','https://example.invalid/token','es');
 assert.match(confirmation.subject,/solicitud/);
 assert.match(confirmation.html,/<html lang="es"/);
 assert.match(confirmation.html,/&lt;script&gt;/);
 assert.doesNotMatch(confirmation.html,/<script>/);
 for(const message of [email.resumeEmail('Ana','https://example.invalid','es'),email.identityEmail('Ana','https://example.invalid','es'),...['rejected','online_offered','accepted','interview_yes'].map(status=>email.decisionEmail(status,'https://example.invalid','es'))]){
  assert.match(message.html,/<html lang="es"/);
  assert.doesNotMatch(message.html,/Dear |Bonjour |All rights reserved/);
 }
});

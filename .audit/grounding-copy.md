# Copy constraints for the CMS

Source: copy walkthrough, plus lib/messages.ts, lib/ui-text.ts, lib/emails.ts, tests/seo.test.mjs.

Four catalogs, all bundled at build time. The request only picks a locale. There is no content table.

- Page copy: lib/translations/{en,fr,es,pt}.json. 372 string leaves, same shape in every locale. Type is typeof en. copyFor(locale) is sync and never touches the database. Root layout passes one locale object into LanguageProvider. generateMetadata and structured data call copyFor again.
- UI chrome: ui-*.json, 114 flat keys. The key is the English source string at the call site. uiText(locale, text) returns the map value or the call-site key. It is a client module. Two English values differ from their keys ("Only program" displays as "Online program"). A missing key must keep falling back to the call-site string, not to ui-en.json.
- Acknowledgements: en/fr/es/pt, 13 keys. Placeholders {name} and {nominee}. signoff contains a literal <br />. Application emails: en/fr/es only, 32 keys, placeholder {name}. There is no pt application catalog. Do not invent one.
- Placeholders in page copy are only {language} and {year}. The runtime interpolator is \{word\}. There is no ICU. tests/seo.test.mjs requires each locale's placeholder set to match English.
- Arrays are zipped to code by index (footer links, testimonials, support options). Phase 1 edits string leaves. It does not add, remove, or reorder array items. A different length mis-pairs links and photos.
- Empty string is a real value. Merge with nullish checks, not truthiness.
- A partial override merges onto that locale's JSON. It does not fall through to English per key. Unknown locale stays the whole English catalog via parseLocale.
- Do not mutate the imported JSON objects. A published edit must be read at request time inside copyFor, the UI loader, and the email loader. Patching only the React prop leaves titles and emails on the file.
- Page strings are React text. An override that contains HTML must be stored and rendered as text. Email signoff is the exception and is already raw HTML. Do not widen that exception.
- Public pages must not call getDb() in a way that throws. A database error returns the JSON object. Caching a failure would pin the site to the fallback until the process restarts, so failures are not cached.
- Per request, copyFor can run three times. One react cache() around the merge is enough. Publish calls revalidateTag so the next request sees the edit. There is no existing cache tag to extend.
- Client components import t from lib/messages.ts, so the four page files stay in the client bundle. UI overrides have to be passed from the server into the client. Changing the server map alone does not change useText().
- app/apply/continue, app/apply/complete, and app/confirmation hardcode strings and sit outside both catalogs. Leave them. continue is part of the apply flow.

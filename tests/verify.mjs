import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {webcrypto} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const bank=JSON.parse(html.match(/<script id="question-bank" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const classics=JSON.parse(html.match(/<script id="classic-bank" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const source=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
new vm.Script(source); // JavaScript syntax check.
let passed=0;
function check(name,fn){fn();passed++;console.log(`PASS ${name}`)}
check('1000 passages; 500 per mode; 125 per mode/level',()=>{
 assert.equal(bank.length,1000);
 for(const mode of ['story','essay'])for(const level of [1,2,3,4])assert.equal(bank.filter(q=>q.mode===mode&&q.level===level).length,125);
 assert.equal(new Set(bank.map(q=>q.theme)).size,250);
});
check('Unique IDs and passages; four distinct versions per theme',()=>{
 assert.equal(new Set(bank.map(q=>q.id)).size,1000);
 assert.equal(new Set(bank.map(q=>q.lines.join(''))).size,1000);
 for(const theme of new Set(bank.map(q=>q.theme))){const versions=bank.filter(q=>q.theme===theme);assert.deepEqual(versions.map(q=>q.level).sort(),[1,2,3,4]);assert.ok(versions[3].lines.join('').length>versions[0].lines.join('').length)}
});
check('All 1000 records have complete five-step material',()=>{
 for(const q of bank){assert.equal(q.lines.length,4);for(const line of q.lines)assert.ok(typeof line==='string'&&line.length>8,q.id);assert.ok(q.title&&q.theme);const keys=q.mode==='story'?['person','event','action','why','change']:['topic','claim','reason','example','conclusion'];for(const key of keys)assert.ok(q[key]?.trim(),`${q.id}/${key}`);if(q.mode==='story'){assert.ok(q.feel.length>=2);assert.ok(!('before'in q));assert.ok(!('after'in q));}else assert.ok([1,2].includes(q.reasonIndex));}
});
check('3 sourced public-domain excerpts with provenance and no invented attribution',()=>{
 assert.equal(classics.length,3);for(const q of classics){assert.ok(q.context.includes('本アプリ作成'));assert.equal(q.source.author,'新美南吉');assert.ok(q.source.url.startsWith('https://www.aozora.gr.jp/cards/000121/'));assert.ok(q.source.note);assert.ok(q.why&&q.change);assert.equal(q.lines.length,4)}
});
check('Single-file app has no network dependency',()=>{
 assert.ok(!/<script[^>]+src=|<link[^>]+href="https?:|<img[^>]+src="https?:|@import|fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(html));
 assert.ok(!html.includes('__BANK__'));assert.ok(!html.includes('__CLASSICS__'));
});
const nodes=new Map();let inputChoices=[];
class NodeStub{constructor(){this._html='';this.value='';this.textContent='';this.disabled=false}set innerHTML(value){this._html=value;if(this===nodes.get('app'))for(const key of [...nodes.keys()])if(!['app','question-bank','classic-bank','exit-dialog','cancel-exit','confirm-exit'].includes(key))nodes.delete(key)}get innerHTML(){return this._html}insertAdjacentHTML(_,v){this._html+=v}addEventListener(){}focus(){}scrollIntoView(){}showModal(){}close(){}querySelectorAll(sel){return sel==='input[name="answer"]:checked'?inputChoices.map(value=>({value})):[]}querySelector(){return null}}
NodeStub.prototype.setAttribute=function(name,value){this[name]=value};
for(const id of ['app','question-bank','classic-bank','exit-dialog','cancel-exit','confirm-exit'])nodes.set(id,new NodeStub());nodes.get('question-bank').textContent=JSON.stringify(bank);nodes.get('classic-bank').textContent=JSON.stringify(classics);
const doc={getElementById(id){if(nodes.has(id))return nodes.get(id);if([...nodes.values()].some(n=>n.innerHTML.includes(`id="${id}"`))){nodes.set(id,new NodeStub());return nodes.get(id)}return null}};
let registered;
doc.modelContext={registerTool(t){registered=t}};
const context=vm.createContext({document:doc,window:{addEventListener(){},scrollTo(){}},requestAnimationFrame(){},crypto:webcrypto,TextEncoder,structuredClone,console,Math,Set,Error,Number,Object,JSON});
vm.runInContext(source+'\nglobalThis.api={BANK,CLASSICS,state,expected,questionInfo,pickQuestions,distractors,quoteExists,esc,start,submit,next,back,revise,showResults,renderExercise,home,submitEntry};',context);
const a=context.api;
assert.equal(a.state.screen,'locked');
assert.deepEqual(Object.keys(registered.execute({})),['screen']);
a.start('story',1,3);assert.equal(a.state.screen,'locked');
await a.submitEntry({preventDefault(){}});assert.equal(a.state.screen,'locked');assert.ok(doc.getElementById('entry-error').textContent);
doc.getElementById('entry-password').value='1234';await a.submitEntry({preventDefault(){}});assert.equal(a.state.screen,'locked');assert.equal(doc.getElementById('entry-password').value,'');
assert.equal(doc.getElementById('entry-submit').disabled,false);
const realCrypto=context.crypto;context.crypto={subtle:{digest(){throw Error('unavailable')}}};
doc.getElementById('entry-password').value='test-input';await a.submitEntry({preventDefault(){}});assert.equal(a.state.screen,'locked');assert.equal(doc.getElementById('entry-submit').disabled,false);assert.equal(doc.getElementById('entry-password').value,'');assert.equal(doc.getElementById('entry-password')['aria-invalid'],'true');context.crypto=realCrypto;
passed++;console.log('PASS Entry gate blocks blank/wrong input, start, WebMCP data, and digest errors');
assert.ok(!/sessionStorage|localStorage|document\.cookie/.test(source));
if(process.env.ENTRY_TEST_PASSWORD){
 doc.getElementById('entry-password').value=process.env.ENTRY_TEST_PASSWORD.replace(/[0-9]/g,c=>String.fromCharCode(c.charCodeAt(0)+0xfee0));const entryField=doc.getElementById('entry-password');
 await a.submitEntry({preventDefault(){}});assert.equal(a.state.screen,'home');assert.equal(entryField.value,'');assert.equal(registered.execute({}).total,1000);
 passed++;console.log('PASS Full-width entry unlocks learning without storing the password or admission');
}else{
 console.log('SKIP Known-password check: set ENTRY_TEST_PASSWORD to run it (the password is not stored in tests)');
 vm.runInContext('admitted=true;home()',context); // Continue unrelated lesson regressions in an admitted fixture.
}
check('Every objective question has 3 unique options including its correct answer',()=>{
 for(const q of a.BANK)for(let s=0;s<5;s++)if(a.questionInfo(q,s).type==='choice'){const choices=a.distractors(q,s);assert.equal(choices.length,3);assert.equal(new Set(choices).size,3);assert.ok(choices.includes(a.expected(q,s)))}
});
check('Every quotation model is an exact extract in its source, including reordered essays',()=>{
 for(const q of a.BANK){const step=q.mode==='story'?3:2;assert.ok(a.quoteExists(q,a.expected(q,step)),q.id);assert.ok(!a.quoteExists(q,'この文章にはない確認用の言葉'));assert.ok(!a.quoteExists(q,'。、  '));}
});
check('Random sessions have no duplicate passages and respect all settings',()=>{
 for(const mode of ['story','essay'])for(const level of [1,2,3,4])for(const n of [1,2,3,4,5,6,7,8,9,10]){const qs=a.pickQuestions(mode,level,n);assert.equal(qs.length,n);assert.equal(new Set(qs.map(q=>q.id)).size,n);assert.ok(qs.every(q=>q.mode===mode&&q.level===level))}
 for(const args of [['bad',1,5],['story',0,5],['story',1,0],['story',1,11],['story',1,1.5]])assert.throws(()=>a.pickQuestions(...args));
});
check('Blank and invalid extracts are stopped; alternative free text is not semantically rejected',()=>{
 const q=a.BANK.find(q=>q.mode==='story'&&q.level===2);a.start('story',2,1,[q]);a.state.step=2;a.renderExercise();doc.getElementById('written').value=' ';a.submit();assert.equal(a.state.step,2);assert.ok(doc.getElementById('error').textContent);
 doc.getElementById('written').value='例にはないけれど、申しわけないと思った。';a.submit();assert.equal(a.state.step,3);assert.ok(a.state.answers[2].text.includes('申しわけない'));
 doc.getElementById('written').value='本文に存在しない文';a.submit();assert.equal(a.state.checked,false);
 doc.getElementById('written').value=q.lines[1];a.submit();assert.equal(a.state.checked,true);assert.equal(a.state.reflection,null);a.next();assert.equal(a.state.step,3);assert.ok(nodes.get('app').innerHTML.includes('申しわけない'));
 a.state.reflection='practice';a.next();assert.equal(a.state.step,4);assert.equal(a.state.answers[3].reflection,'practice');
});
check('Level 1 emotional-change scaffold accepts multiple interpretations and requires all fields',()=>{
 const q=a.BANK.find(q=>q.mode==='story'&&q.level===1);a.start('story',1,1,[q]);a.state.step=4;a.renderExercise();assert.equal(a.questionInfo(q,4).type,'change');a.submit();assert.equal(a.state.checked,false);
 doc.getElementById('change-before').value='不安';doc.getElementById('change-after').value='ほかの気持ち・言葉に迷う';doc.getElementById('change-trigger').value='3';a.submit();assert.equal(a.state.checked,true);assert.equal(a.state.reflection,null);assert.ok(a.state.answers[4].text.includes('ほかの気持ち'));
});
check('Wrong objective answers do not advance; correction preserves attempt count',()=>{
 const q=a.BANK.find(q=>q.mode==='essay'&&q.level===1);a.start('essay',1,1,[q]);inputChoices=['wrong'];a.submit();assert.equal(a.state.step,0);assert.equal(a.state.checked,false);assert.equal(a.state.failures,1);inputChoices=[a.expected(q,0)];a.submit();assert.equal(a.state.checked,true);assert.equal(a.state.answers[0].failures,1);a.next();assert.equal(a.state.step,1);inputChoices=[];
});
check('Revision of feeling clears downstream evidence and keeps earlier answers',()=>{
 const q=a.BANK.find(q=>q.mode==='story'&&q.level===2);a.start('story',2,1,[q]);a.state.answers=[{text:'event'},{text:'action'},{text:'fear',selected:[],draft:'fear',failures:0},{text:'quote'}];a.state.step=3;a.revise();assert.equal(a.state.step,2);assert.equal(a.state.draft,'fear');assert.equal(a.state.answers.length,2);
});
check('End-to-end state transitions through all 5 steps, both modes and all levels',()=>{
 for(const mode of ['story','essay'])for(const level of [1,2,3,4]){
 const q=a.BANK.find(x=>x.mode===mode&&x.level===level);a.start(mode,level,1,[q]);
 for(let s=0;s<5;s++){
 assert.equal(a.state.step,s);const info=a.questionInfo(q,s);inputChoices=[];
 if(info.type==='choice')inputChoices=[a.expected(q,s)];
 else if(info.type==='feeling'){inputChoices=[q.feel[0],q.feel[1]];doc.getElementById('other-feeling').value='';}
 else if(info.type==='change'){doc.getElementById('change-before').value=q.feel[0];doc.getElementById('change-after').value='ほかの気持ち・言葉に迷う';doc.getElementById('change-trigger').value='3';}
 else doc.getElementById('written').value=info.type==='evidence'?a.expected(q,s):'文章を読んで自分で考えた答え。';
 a.submit();if(mode==='story'&&s===2)continue;assert.ok(a.state.checked,`${mode}/${level}/${s}`);if(!a.state.reflection)a.state.reflection='ok';a.next();
 }
 assert.equal(a.state.screen,'results');assert.equal(a.state.records.length,1);assert.equal(a.state.records[0].answers.length,5);assert.ok(nodes.get('app').innerHTML.includes('自由に書いた答えは点数にしていません'));
 }
 inputChoices=[];
});
check('HTML escapes student answers and external strings',()=>{assert.equal(a.esc('<img src=x onerror=alert(1)>'),'&lt;img src=x onerror=alert(1)&gt;');assert.ok(a.esc('" & \'').includes('&quot;'))});
check('Returning from one classic or a two-question retry restores a selectable home count',()=>{for(const count of [1,2,4,6]){a.state.count=count;a.home();assert.equal(a.state.count,5);assert.ok(nodes.get('app').innerHTML.includes('value="5" checked'))}});
check('WebMCP read tool validates input and shares visible state without mutation',()=>{
 assert.equal(registered.name,'read_reading_practice');assert.equal(registered.annotations.readOnlyHint,true);const before=a.state.screen;assert.equal(registered.execute({}).screen,before);assert.throws(()=>registered.execute({unexpected:true}));assert.throws(()=>registered.execute(null));assert.equal(a.state.screen,before);
});
console.log(`\n${passed} groups passed. 1000 original exercises + 3 sourced exercises checked.`);
const lengths={};for(const mode of ['story','essay'])for(const level of [1,2,3,4]){const ls=bank.filter(q=>q.mode===mode&&q.level===level).map(q=>q.lines.join('').length);lengths[`${mode}-${level}`]={min:Math.min(...ls),max:Math.max(...ls),average:Math.round(ls.reduce((s,n)=>s+n,0)/ls.length)}}console.log(JSON.stringify(lengths,null,2));

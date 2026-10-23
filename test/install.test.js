import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {paths,verifyPackage,initializeCertificate,stage,activate,plistText} from '../lib/install.js';
const source=fileURLToPath(new URL('..',import.meta.url));
const engine=path.join(source,'bin/cursor-magpie-bridge');
const temp=t=>{const p=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-install-test-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;};
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const init=root=>spawnSync(engine,['--init-ca'],{encoding:'utf8',env:{...process.env,CURSOR_BYOK_DATA_DIR:root}});
test('fresh machines generate distinct CAs without a BYOK install, database or trust changes',t=>{
 const root=temp(t),one=path.join(root,'one'),two=path.join(root,'two');
 assert.equal(init(one).status,0);assert.equal(init(two).status,0);
 assert.equal(JSON.parse(init(one).stdout).ca,'untrusted');
 assert.notEqual(hash(path.join(one,'ca/ca.key')),hash(path.join(two,'ca/ca.key')));
 assert.equal(fs.statSync(path.join(one,'ca/ca.key')).mode&0o777,0o600);
 assert.equal(fs.statSync(path.join(one,'ca')).mode&0o777,0o700);
 const before=hash(path.join(one,'ca/ca.key'));assert.equal(init(one).status,0);assert.equal(hash(path.join(one,'ca/ca.key')),before);
 assert.deepEqual(fs.readdirSync(one),['ca']);
 fs.unlinkSync(path.join(one,'ca/ca.crt'));assert.notEqual(init(one).status,0);assert.equal(hash(path.join(one,'ca/ca.key')),before);
});
test('package and native engine have the same pinned version and digest',()=>{assert.equal(verifyPackage(source).version,'0.2.2');});
test('certificate trust uses SSL policy and argument arrays, and refuses failed authorization',t=>{
 const p=paths(temp(t)),calls=[];let trusted=false;
 const exec=(cmd,args,options)=>{calls.push({cmd,args,options});if(args[0]==='--init-ca')return {status:0,stdout:'{"ca":"untrusted"}'};if(args[0]==='add-trusted-cert'){trusted=true;return {status:0};}return {status:trusted?0:1};};
 initializeCertificate(engine,p,exec);
 assert.equal(calls.filter(c=>c.args[0]==='add-trusted-cert').length,1);
 assert.deepEqual(calls.at(-1).args.slice(-2),['-p','ssl']);
 calls.length=0;initializeCertificate(engine,p,exec);assert.equal(calls.some(c=>c.args[0]==='add-trusted-cert'),false);
 trusted=false;assert.throws(()=>initializeCertificate(engine,p,exec,{trust:false}),/尚未受信任/);
 assert.throws(()=>initializeCertificate(engine,p,(cmd,args)=>args[0]==='--init-ca'?{stdout:'{}'}:{status:1}),/信任未完成/);
});
test('service plist escapes paths and uses an installed runtime, independent of nvm and Magpie cache',t=>{
 const p=paths(temp(t));const xml=plistText(p,'/tmp/A & B/runtime','/tmp/A < B/release');
 assert.match(xml,/A &amp; B/);assert.match(xml,/A &lt; B/);assert.doesNotMatch(xml,/nvm|\.cache/);
});
test('complete staging never overwrites an existing running release',t=>{
 const p=paths(temp(t));const fakeRuntime=path.join(p.home,'runtime');fs.writeFileSync(fakeRuntime,'test');
 const one=stage(source,p,'0.2.2',fakeRuntime),two=stage(source,p,'0.2.2',fakeRuntime);
 assert.notEqual(one,two);assert.equal(hash(path.join(one,'bin/cursor-magpie-bridge')),hash(engine));
 assert.ok(fs.existsSync(path.join(two,'node_modules/jsonc-parser/package.json')));
 assert.equal(fs.statSync(path.join(two,'bin/runtime')).mode&0o777,0o755);
});
test('failed activation restores previous launch configuration and restarts previous release',{timeout:15000},async t=>{
 const p=paths(temp(t));fs.mkdirSync(path.dirname(p.plist),{recursive:true});fs.writeFileSync(p.plist,'previous');
 let bootstraps=0;const exec=(cmd,args)=>{if(args[0]==='bootstrap'){bootstraps++;return {status:bootstraps<=5?1:0};}return {status:1};};
 await assert.rejects(activate(p,'/new/release','gui/999',exec),/未能启动/);
 assert.equal(fs.readFileSync(p.plist,'utf8'),'previous');assert.equal(bootstraps,6);
});

test('GitHub installation supports a dependency hoisted by Magpie Bun',t=>{
 const home=temp(t),parent=path.join(home,'node_modules'),plugin=path.join(parent,'magpie-agent-cursor-bridge');
 fs.mkdirSync(plugin,{recursive:true});
 for(const name of fs.readdirSync(source)) {
   if(['node_modules','.git'].includes(name)) continue;
   fs.cpSync(path.join(source,name),path.join(plugin,name),{recursive:true});
 }
 fs.cpSync(path.dirname(createRequire(import.meta.url).resolve('jsonc-parser/package.json')),path.join(parent,'jsonc-parser'),{recursive:true});
 assert.equal(verifyPackage(plugin).version,'0.2.2');
 const runtime=path.join(home,'runtime');fs.writeFileSync(runtime,'test');
 const release=stage(plugin,paths(home),'0.2.2',runtime);
 assert.ok(fs.existsSync(path.join(release,'node_modules/jsonc-parser/package.json')));
});

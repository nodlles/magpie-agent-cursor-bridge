#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {atomic,applyProxy,restoreProxy} from './lib/settings.js';
import {validate,gatewayModels} from './lib/config.js';

const packageDir=path.dirname(fileURLToPath(import.meta.url));
const version=JSON.parse(fs.readFileSync(path.join(packageDir,'package.json'),'utf8')).version;
const root=process.env.CURSOR_BRIDGE_ROOT||path.join(os.homedir(),'.config/magpie-cursor-bridge');
const settings=process.env.CURSOR_BRIDGE_SETTINGS||path.join(os.homedir(),'Library/Application Support/Cursor/User/settings.json');
const file=name=>path.join(root,name);
let lastStatus='';
const status=(state,extra={})=>{const signature=JSON.stringify({version,state,...extra});if(signature!==lastStatus){atomic(file('status.json'),JSON.stringify({version,state,...extra,updated:new Date().toISOString()},null,2));lastStatus=signature;}};
const read=name=>JSON.parse(fs.readFileSync(file(name),'utf8'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// Native diagnostics stay local: 0600 file next to the other bridge state, rotated at 4 MiB.
const ENGINE_LOG_LIMIT=4*1024*1024;
let engineLogStream=null;
function engineLog() {
  if(engineLogStream) return engineLogStream;
  const log=file('engine.log');
  try {if(fs.statSync(log).size>ENGINE_LOG_LIMIT) fs.renameSync(log,file('engine.log.1'));} catch {}
  engineLogStream=fs.createWriteStream(log,{flags:'a',mode:0o600});
  engineLogStream.on('error',()=>{engineLogStream=null;});
  return engineLogStream;
}
// A reused pid must not look like a live supervisor: match the command line too.
function isLiveSupervisor(pid) {
  if(!Number.isInteger(pid)||pid<=0||pid===process.pid) return false;
  try {process.kill(pid,0);} catch {return false;}
  try {
    const line=execFileSync('/bin/ps',['-p',String(pid),'-o','command='],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    return line.includes('bridge.js')&&line.includes('supervise');
  } catch {return false;}
}
const command=process.argv[2]||'status';
if(command==='status') {
  console.log(fs.existsSync(file('status.json'))?fs.readFileSync(file('status.json'),'utf8'):'未安装或尚未运行');
} else if(command==='restore') {
  console.log(JSON.stringify({preservedExternalChanges:restoreProxy(file('settings-journal.json'))}));
} else if(command==='supervise') {
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  process.umask(0o077);
  const lock=file('supervisor.lock');
  try {fs.mkdirSync(lock);} catch(error) {
    let live=false;
    try {live=isLiveSupervisor(Number(fs.readFileSync(path.join(lock,'pid'),'utf8')));} catch {}
    if(live) throw new Error('bridge supervisor already running');
    fs.rmSync(lock,{recursive:true,force:true}); fs.mkdirSync(lock);
  }
  fs.writeFileSync(path.join(lock,'pid'),String(process.pid));
  let child=null,ready=null,ending=false,lastConfig='',nextRefresh=0,paused=false,catalogueDownSince=0,lastModelCount=0,lastEffective='';
  const GATEWAY_GRACE_MS=60_000;
  async function stop() {
    // Restore before stopping the listener so Cursor does not point at a dead port.
    const old=child;child=null;ready=null;
    try {
      return restoreProxy(file('settings-journal.json'));
    } finally {
      if(old && old.exitCode===null && old.signalCode===null) {
        old.kill('SIGTERM');
        await Promise.race([new Promise(r=>old.once('exit',r)),wait(12000)]);
        if(old.exitCode===null && old.signalCode===null) {
          old.kill('SIGKILL');
          await new Promise(r=>old.once('exit',r));
        }
      }
    }
  }
  async function start(c) {
    const serialized=JSON.stringify(c);
    atomic(file('effective.json'),serialized);
    lastEffective=serialized;
    const engine=spawn(path.join(packageDir,'bin/cursor-magpie-bridge'),[file('effective.json')],{
      env:{...process.env,CURSOR_BYOK_DATA_DIR:file('data')},stdio:['pipe','pipe','pipe']
    });
    child=engine;
    // Native diagnostics can contain request information; keep them in a private local file.
    engine.stderr.pipe(engineLog(),{end:false});
    ready=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('bridge startup timed out')),30000);
      const lines=createInterface({input:engine.stdout});
      lines.on('line',line=>{try{const msg=JSON.parse(line);if(msg.event==='ready'){clearTimeout(timer);resolve(msg);}}catch{}});
      engine.once('error',()=>{clearTimeout(timer);reject(new Error('cannot start bridge engine'));});
      engine.once('exit',(code,signal)=>{clearTimeout(timer);reject(new Error(`bridge engine stopped (${signal||code}); check certificate trust`));});
    });
    applyProxy(settings,file('settings-journal.json'),ready.proxy);
  }
  for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{ending=true;});
  try {
    restoreProxy(file('settings-journal.json'));
    while(!ending) {
      try {
        const raw=fs.existsSync(file('connection.json'))?fs.readFileSync(file('connection.json'),'utf8'):'{}';
        const c=validate(JSON.parse(raw));
        if(!c) {await stop();status('disconnected');paused=false;lastConfig='';}
        else if(paused && raw===lastConfig) {status('paused',{reason:'Cursor 代理设置由其他程序改动；请在 Magpie 中断开后重新连接。'});}
        else {
          const changed=raw!==lastConfig;
          const engineAlive=!!child && child.exitCode===null && child.signalCode===null;
          if(changed || Date.now()>=nextRefresh || !engineAlive) {
            let effective=null,failure=null;
            try {effective=await gatewayModels(c);} catch(e) {failure=e;}
            nextRefresh=Date.now()+15000;
            if(failure) {
              // A transient Magpie hiccup must not drop Cursor's proxy: keep the running
              // engine (and its port) and only fall back once the outage is sustained.
              if(!catalogueDownSince) catalogueDownSince=Date.now();
              const downFor=Date.now()-catalogueDownSince;
              if(!engineAlive || downFor>=GATEWAY_GRACE_MS) throw failure;
              status('connected',{model:c.model,models:lastModelCount,proxy:ready.proxy,backend:ready.backend,pid:child.pid,warning:`Magpie gateway unavailable for ${Math.round(downFor/1000)}s: ${failure.message}`});
              await wait(2000);
              continue;
            }
            catalogueDownSince=0;
            if(!engineAlive) {
              await stop();await start(effective);
            } else {
              const serialized=JSON.stringify(effective);
              if(serialized!==lastEffective) {atomic(file('effective.json'),serialized);lastEffective=serialized;}
            }
            lastConfig=raw;paused=false;lastModelCount=effective.models.length;
            status('connected',{model:c.model,models:effective.models.length,proxy:ready.proxy,backend:ready.backend,pid:child.pid});
          }
          try {applyProxy(settings,file('settings-journal.json'),ready.proxy);} catch(e) {
            await stop();paused=true;lastConfig=raw;throw e;
          }
        }
      } catch(e) {
        try {await stop();} catch { /* keep journal for recovery after malformed settings are fixed */ }
        status('error',{reason:e.message});
      }
      if(!ending) await wait(2000);
    }
  } finally {
    await stop();status('stopped');fs.rmSync(lock,{recursive:true,force:true});
  }
} else {throw new Error('usage: node bridge.js status|supervise|restore');}

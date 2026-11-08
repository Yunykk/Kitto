import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../src/lib/android-audio.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
}).outputText;
const { createAndroidAudio } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const state = (patch = {}) => ({path:null,index:-1,position:0,duration:0,playing:false,buffering:false,ended:false,error:null,revision:1,canNext:false,canPrevious:false,shuffle:false,repeatMode:"off",...patch});
const settle = async () => { for(let i=0;i<20;i++) await Promise.resolve(); };
const tracks = [{id:"a",path:"content://audio/a",title:"Sunrise"},{id:"b",path:"content://audio/b",title:"Moonlight"}];
function fixture() {
  const calls=[]; let current=state();
  const request=async(command,payload={})=>{
    calls.push({command,payload});
    if(command==='setQueue')current=state({...current,path:payload.tracks[payload.index]?.path??null,index:payload.index,position:payload.position,duration:60,playing:payload.autoplay});
    if(command==='play')current={...current,playing:true};
    if(command==='pause')current={...current,playing:false};
    if(command==='seek')current={...current,position:payload.position};
    if(command==='stop')current=state();
    if(command==='next')current={...current,path:tracks[1].path,index:1,position:0};
    return {...current,revision:++current.revision};
  };
  const audio=createAndroidAudio(request);
  return {audio,calls,set:value=>{current=state(value);}};
}
test('Android passes the whole queue, original URI and restore position to native playback',async()=>{
  const {audio,calls}=fixture(); audio.setContext(tracks);audio.loadAudio(tracks[1].path,17);await settle();
  assert.equal(calls[0].command,'setQueue');assert.deepEqual(calls[0].payload.tracks,tracks);
  assert.equal(calls[0].payload.index,1);assert.equal(calls[0].payload.position,17);assert.equal(calls[0].payload.autoplay,false);
  await audio.playAudio();assert.equal(audio.state.playing,true);audio.dispose();
});
test('native automatic transitions update track identity without reloading or stopping the service',async()=>{
  const {audio,calls,set}=fixture();const samples=[];audio.onAudioPlayback(s=>samples.push(s));
  set({path:tracks[0].path,index:0,position:30,duration:60,playing:true,revision:5});await audio.refresh();
  const firstId=audio.getAudioPlayback().loadId;
  set({path:tracks[1].path,index:1,position:2,duration:45,playing:true,revision:6});await audio.refresh();
  assert.equal(samples.at(-1).path,tracks[1].path);assert.equal(samples.at(-1).active,true);
  assert.equal(samples.at(-1).loadId,firstId+1);assert.deepEqual(calls.map(x=>x.command),['snapshot','snapshot']);audio.dispose();
});
test('an in-flight stale Android poll cannot rewind an explicit new track',async()=>{
  let resolve;const calls=[];
  const audio=createAndroidAudio(async(command,payload)=>{
    calls.push(command);
    if(command==='snapshot')return new Promise(done=>{resolve=done;});
    return state({path:payload.tracks[0].path,index:0,duration:60,revision:9});
  });
  const poll=audio.refresh();audio.setContext(tracks);audio.loadAudio(tracks[0].path,0);
  resolve(state({path:'content://audio/old',position:50,revision:8}));await poll;await settle();
  assert.equal(audio.state.path,tracks[0].path);assert.deepEqual(calls,['snapshot','setQueue']);audio.dispose();
});
test('queue updates preserve native playback rather than applying stale WebView timing',async()=>{
  const {audio,calls}=fixture();audio.setContext(tracks);audio.loadAudio(tracks[0].path);await settle();await audio.playAudio();
  audio.syncQueue([...tracks,{id:'c',path:'content://audio/c',title:'C'}]);await settle();
  const update=calls.at(-1);assert.equal(update.command,'setQueue');assert.equal(update.payload.preserveCurrent,true);
  assert.equal(update.payload.autoplay,true);assert.equal(update.payload.tracks.length,3);audio.dispose();
});
test('command failures reach listeners and later native state clears the failure',async()=>{
  let fail=true;let errors=0;
  const audio=createAndroidAudio(async()=>{if(fail)throw new Error('Document permission revoked');return state({revision:3});});
  audio.onAudioError(()=>errors++);await assert.rejects(audio.playAudio(),/permission revoked/);
  assert.equal(errors,1);assert.match(audio.state.error,/permission revoked/);fail=false;await audio.refresh();assert.equal(audio.state.error,null);audio.dispose();
});
test('Android seek and volume clamp invalid input, and disposal never stops background audio',async()=>{
  const {audio,calls,set}=fixture();set({path:tracks[0].path,duration:60,revision:2});await audio.refresh();
  audio.seekTo(100);audio.seekTo(NaN);audio.setVolume(2);await settle();
  assert.equal(calls.find(x=>x.command==='seek').payload.position,60);assert.equal(calls.filter(x=>x.command==='seek').length,1);
  assert.equal(calls.find(x=>x.command==='volume').payload.volume,1);
  const before=calls.length;audio.dispose();assert.equal(calls.length,before);assert.equal(calls.some(x=>x.command==='stop'),false);
});
test('a late older playback rejection does not replace a newer track with an error',async()=>{
  let reject;
  const audio=createAndroidAudio(async(command,payload)=>{
    if(command==='play')return new Promise((_resolve,no)=>{reject=no;});
    return state({path:payload.tracks[0].path,index:0,revision:9});
  });
  const old=audio.playAudio();await settle();audio.setContext(tracks);audio.loadAudio(tracks[0].path);
  reject(new Error('old play'));await assert.rejects(old);await settle();
  assert.equal(audio.state.path,tracks[0].path);assert.equal(audio.state.error,null);audio.dispose();
});
test('a restarted native service can publish its new epoch without being rejected as an old revision',async()=>{
  const {audio,set}=fixture();
  set({serviceId:'first',path:tracks[0].path,revision:500,playing:true});await audio.refresh();
  set({serviceId:'restarted',path:tracks[0].path,revision:1,playing:false,position:19});await audio.refresh();
  assert.equal(audio.state.serviceId,'restarted');assert.equal(audio.state.position,19);assert.equal(audio.state.playing,false);audio.dispose();
});

test('Android tuning is ordered with transport commands and never changes playback speed',async()=>{
  const {audio,calls}=fixture();
  const tuning=audio.configureTuning(432);
  const play=audio.playAudio();
  await Promise.all([tuning,play]);
  assert.deepEqual(calls.map(call=>call.command),['tuning','play']);
  assert.deepEqual(calls[0].payload,{frequency:432});
  assert.equal(audio.getAudioPlayback().playbackRate,1);
  await audio.configureTuning(null);
  assert.deepEqual(calls.at(-1).payload,{frequency:null});
  audio.dispose();
});

#!/bin/bash
# build one short: frames, soundtrack, mp4, thumbnail
v=$1; export F=${2:-short}; cd "$(dirname "$0")"
NAME=$( [ "$F" = short ] && echo short || ([ "$F" = feed ] && echo 1080x1350 || echo 1920x1080) )
id=$(node -e "global.window={};require('./videos.js');console.log(window.VIDEOS[$v].id)")
node rec.mjs $v || exit 1
EV=$(node -e "
global.window={seg:()=>0};require('./videos.js');require('./scenes.js');
const V=window.VIDEOS[$v]; const S=window.SOUND[V.scene]; const C=[2.0,6.2,10.4];
const ev={bpm:V.bpm,key:V.key,whoosh:[1.65,14.55],pop:[],tick:[],ding:[15.0]};
C.forEach((c,ci)=>{ (S.pop||[]).forEach(x=>ev.pop.push(+(c+x).toFixed(3)));
  let ticks=S.tick||[]; if(V.scene==='keyboard') ticks=ticks.slice(0,[5,8,11][ci]);
  ticks.forEach(x=>ev.tick.push(+(c+x).toFixed(3))); (S.ding||[]).forEach(x=>ev.ding.push(+(c+x).toFixed(3))); });
console.log(JSON.stringify(ev));")
python3 track.py /tmp/fr/a$v$F.wav 16.5 "$EV"
mkdir -p out
ffmpeg -y -loglevel error -framerate 30 -i /tmp/fr/v$v$F/f%04d.jpg -i /tmp/fr/a$v$F.wav -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 160k -shortest -movflags +faststart out/zentapdf-$NAME-$id.mp4
node snap1.mjs $v out/zentapdf-$NAME-$id-thumbnail.png
echo done $v $F $id

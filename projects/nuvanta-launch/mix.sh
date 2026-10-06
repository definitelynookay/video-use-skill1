#!/usr/bin/env bash
# Mix VO + music bed for the Nuvanta video -> audio/mix.wav (73.5s, -14 LUFS, -1.5 dBTP)
# Music is 60s; extended by crossfading at 36s back one 8-bar phrase (16.957s, measured by
# onset autocorrelation) so the track's own outro lands on the end card.
set -euo pipefail
cd "$(dirname "$0")"
DUR=73.5; LOOP=16.957; XAT=36
FILTER="[1:a]atrim=0:$((XAT+1)),asetpts=PTS-STARTPTS[a];
[1:a]atrim=start=$(python3 -c "print($XAT-$LOOP)"),asetpts=PTS-STARTPTS[b];
[a][b]acrossfade=d=1:c1=tri:c2=tri,volume=-6dB,afade=t=in:d=0.4,afade=t=out:st=71.0:d=2.5,atrim=0:$DUR[mus];
[0:a]aresample=44100,pan=stereo|c0=c0|c1=c0,volume=8dB,apad,atrim=0:$DUR,asplit[vo][key];
[mus][key]sidechaincompress=threshold=0.03:ratio=3:attack=60:release=600[duck];
[vo][duck]amix=inputs=2:normalize=0:duration=longest[mix]"
ffmpeg -v error -y -i audio/vo_v2.mp3 -i audio/music.mp3 -filter_complex "$FILTER" -map "[mix]" -ar 44100 out/premix.wav
# two-pass loudness normalisation
M=$(ffmpeg -hide_banner -i out/premix.wav -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
g(){ echo "$M" | python3 -c "import json,sys;print(json.load(sys.stdin)['$1'])"; }
ffmpeg -v error -y -i out/premix.wav -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true" -ar 48000 audio/mix.wav
ffmpeg -hide_banner -i audio/mix.wav -af ebur128=peak=true:framelog=quiet -f null - 2>&1 | grep -E "^\s+(I:|Peak:)"

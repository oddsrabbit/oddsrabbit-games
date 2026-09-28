#!/bin/bash
# Encode each scene's frames, then cut them on the beat with the music into the final reel.
set -e
cd "$(dirname "$0")"
F=$PWD/node_modules/@ffmpeg-installer/linux-x64/ffmpeg
SEG="adopt:3.0 feed:3.0 play:3.5 decorate:4.5 garden:2.5 visitor:2.5 winter:2.5 end:3.8"
mkdir -p clips
IN=""; FC=""; CAT=""; i=0; TOT=0
for x in $SEG; do n=${x%%:*}; d=${x##*:}
  (cd frames/$n && $F -loglevel error -y -f concat -safe 0 -i list.txt -vf "fps=30,scale=1080:1920:flags=lanczos,format=yuv420p" -c:v libx264 -crf 14 ../../clips/$n.mp4)
  st=0.05; [ $n = end ] && st=0
  IN="$IN -i clips/$n.mp4"; FC="$FC[$i:v]trim=start=$st:duration=$d,setpts=PTS-STARTPTS,fps=30[v$i];"; CAT="$CAT[v$i]"
  i=$((i+1)); TOT=$(python3 -c "print($TOT+$d)"); done
$F -loglevel error -y $IN -i music.wav -filter_complex "${FC}${CAT}concat=n=$i:v=1:a=0[v];[$i:a]atrim=0:$TOT,afade=t=in:d=0.3,afade=t=out:st=$(python3 -c "print($TOT-1.5)"):d=1.5,volume=0.9[a]" \
  -map "[v]" -map "[a]" -t $TOT -c:v libx264 -profile:v high -crf 17 -preset slow -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -ar 44100 -ac 2 -movflags +faststart rabbit-pets-reel.mp4
echo "rabbit-pets-reel.mp4: ${TOT}s"

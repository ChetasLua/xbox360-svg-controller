#!/usr/bin/env bash
# Mux the rendered video with the final mix -> out/i-smell-fear.mp4 (X-friendly H.264 + AAC, faststart)
set -euo pipefail
cd "$(dirname "$0")/.."
ffmpeg -v error -y -i out/video_only.mp4 -i audio/mix.m4a -map 0:v -map 1:a -c:v copy -c:a copy -shortest -movflags +faststart out/i-smell-fear.mp4
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate -of compact out/i-smell-fear.mp4

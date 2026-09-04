#!/usr/bin/env bash
#
# Video ingest: source clip -> HLS ladder -> object storage -> a `video` row.
#
# You curate the clips; this builds the pipeline around them.
#
#   tools/transcode.sh input.mp4 out/apple-scab-360 --projection equirect --stereo top_bottom
#
# Notes that come from the platform, not from taste:
#   * NEVER upscale. A rendition taller than the source adds no detail, only
#     blur and bitrate -- a 320x240 microscopy clip pushed to 1080p looks
#     markedly worse than the same clip left at 240p, and worse still on a VR
#     panel where it fills your view. The ladder is built from the source
#     height and stops there.
#   * Quest decodes 4K on every format but only h.265/AV1 above that, so
#     anything over 4K also gets an h.265 rendition.
#   * 6-second segments: long enough to keep the request rate sane, short
#     enough that seeking in a 360 clip does not stall.
#   * Each variant gets its own audio mapping. Pointing two variants at the
#     same a:0 makes ffmpeg reject the job outright.
#   * Plenty of scientific footage is silent, so the audio arguments are built
#     from what the source actually has.

set -euo pipefail

INPUT="${1:?usage: transcode.sh <input> <outdir> [--projection flat|equirect|equirect180] [--stereo none|top_bottom|left_right]}"
OUTDIR="${2:?missing output directory}"
shift 2

PROJECTION="flat"
STEREO="none"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --projection) PROJECTION="$2"; shift 2 ;;
    --stereo)     STEREO="$2";     shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

command -v ffmpeg >/dev/null || { echo "ffmpeg is not installed" >&2; exit 1; }
mkdir -p "$OUTDIR"

WIDTH=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$INPUT")
HEIGHT=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$INPUT")
DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$INPUT" | cut -d. -f1)
HAS_AUDIO=$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$INPUT" | head -1)

# ---- build the ladder from the source, capped at its height ----------------
#
# The top rung is the source height, so the best rendition is a 1:1 copy rather
# than a downscale-then-upscale round trip -- but clamped to 2160. Quest cannot
# decode h.264 above 4K (see preferredCodec() in the web app), and index.m3u8 is
# the only playlist anything registers, so an h.264 2880p rung inside it would
# be an unplayable top variant. Above 4K the h.265 pass below is the answer.
#
# Rounded down to even: h.264 requires even dimensions, and scale=-2:$H only
# forces the WIDTH even, so an odd source height fails the whole job.
TOP=$(( HEIGHT < 2160 ? HEIGHT : 2160 ))
TOP=$(( TOP - TOP % 2 ))

LADDER=()
for h in 360 720 1080; do
  if [[ "$h" -lt "$TOP" ]]; then LADDER+=("$h"); fi
done
LADDER+=("$TOP")

echo "source ${WIDTH}x${HEIGHT}, ${DURATION}s, audio=${HAS_AUDIO:-none}, projection=$PROJECTION stereo=$STEREO"
echo "ladder: ${LADDER[*]}"

bitrate_for() {  # kbps, scaled by pixel count; generous, these are short clips
  local h=$1
  if   [[ $h -ge 2160 ]]; then echo 16000
  elif [[ $h -ge 1440 ]]; then echo 9000
  elif [[ $h -ge 1080 ]]; then echo 5500
  elif [[ $h -ge 720  ]]; then echo 2800
  elif [[ $h -ge 480  ]]; then echo 1400
  else                         echo 800
  fi
}

FILTER=""
SPLIT="[0:v]split=${#LADDER[@]}"
for i in "${!LADDER[@]}"; do SPLIT="${SPLIT}[v${i}]"; done
FILTER="${SPLIT};"
for i in "${!LADDER[@]}"; do
  h=${LADDER[$i]}
  # -2 keeps the aspect ratio and guarantees an even width, which h.264 requires.
  FILTER="${FILTER}[v${i}]scale=-2:${h}[v${i}out];"
done
FILTER="${FILTER%;}"

ARGS=()
STREAM_MAP=""
for i in "${!LADDER[@]}"; do
  h=${LADDER[$i]}
  ARGS+=(-map "[v${i}out]" -c:v:${i} libx264 -b:v:${i} "$(bitrate_for "$h")k"
         -preset veryfast -profile:v main)
  if [[ -n "$HAS_AUDIO" ]]; then
    ARGS+=(-map a:0)
    STREAM_MAP="${STREAM_MAP}v:${i},a:${i},name:${h}p "
  else
    STREAM_MAP="${STREAM_MAP}v:${i},name:${h}p "
  fi
done
[[ -n "$HAS_AUDIO" ]] && ARGS+=(-c:a aac -b:a 128k -ac 2)

ffmpeg -hide_banner -loglevel warning -y -i "$INPUT" \
  -filter_complex "$FILTER" \
  "${ARGS[@]}" \
  -f hls -hls_time 6 -hls_playlist_type vod -hls_flags independent_segments \
  -hls_segment_type mpegts \
  -hls_segment_filename "$OUTDIR/h264_%v_%03d.ts" \
  -master_pl_name index.m3u8 \
  -var_stream_map "${STREAM_MAP% }" \
  "$OUTDIR/h264_%v.m3u8"

# ---- h.265 for anything above 4K, which is every 360 clip worth having ----
if [[ "$HEIGHT" -gt 2160 ]]; then
  echo "adding h.265 rendition (source is above 4K)"
  ffmpeg -hide_banner -loglevel warning -y -i "$INPUT" \
    -c:v libx265 -tag:v hvc1 -b:v 24000k -preset medium \
    ${HAS_AUDIO:+-c:a aac -b:a 128k} \
    -f hls -hls_time 6 -hls_playlist_type vod \
    -hls_segment_filename "$OUTDIR/h265_%03d.mp4" -hls_segment_type fmp4 \
    "$OUTDIR/h265.m3u8"
fi

# ---- poster frame, taken 10% in so it is not a black lead-in ----
ffmpeg -hide_banner -loglevel warning -y -i "$INPUT" \
  -ss "$(( DURATION / 10 ))" -frames:v 1 -update 1 -q:v 2 "$OUTDIR/poster.jpg"

cat > "$OUTDIR/video.json" <<JSON
{
  "hls_key": "videos/$(basename "$OUTDIR")/index.m3u8",
  "poster_key": "videos/$(basename "$OUTDIR")/poster.jpg",
  "duration_s": ${DURATION},
  "width": ${WIDTH},
  "height": ${HEIGHT},
  "projection": "${PROJECTION}",
  "stereo": "${STEREO}"
}
JSON

echo
# ${arr[-1]} is a bash 4 feature; macOS ships bash 3.2, where it is a
# "bad array subscript" error.
BEST=${LADDER[$(( ${#LADDER[@]} - 1 ))]}
echo
echo "wrote $OUTDIR (top rendition ${BEST}p, never upscaled)"
echo "upload it, then register the row:"
echo "  aws s3 sync $OUTDIR s3://\$S3_BUCKET/videos/$(basename "$OUTDIR")/ --endpoint-url \$S3_ENDPOINT_URL"
echo "  python services/api/register_video.py $OUTDIR/video.json --disease-id <id> --kind field360 --title '...'"
echo "or let tools/ingest_catalogue.py do all of it from data/video_catalogue.json"

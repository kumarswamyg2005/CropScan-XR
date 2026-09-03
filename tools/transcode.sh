#!/usr/bin/env bash
#
# Video ingest: source clip -> HLS ladder -> object storage -> a `video` row.
#
# You curate the clips; this builds the pipeline around them.
#
#   tools/transcode.sh input.mp4 out/apple-scab-360 --projection equirect --stereo top_bottom
#
# Notes that come from the platform, not from taste:
#   * Quest decodes 4K on every format but only h.265/AV1 above that, so
#     anything over 4K gets an h.265 rendition and h.264 is capped at 1080p.
#   * 6-second segments: long enough to keep the request rate sane, short
#     enough that seeking in a 360 clip does not stall.
#   * Each variant gets its own audio mapping. Pointing two variants at the
#     same a:0 makes ffmpeg reject the job outright.
#   * Do not assume AV1 hardware decode on older Quest hardware.

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

HEIGHT=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$INPUT")
DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$INPUT" | cut -d. -f1)

# Plenty of scientific footage is silent -- microscopy clips usually have no
# audio track at all. Mapping a:0 unconditionally kills the whole job on those,
# so the audio arguments are built from what the source actually has.
HAS_AUDIO=$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$INPUT" | head -1)

# The ${arr[@]+"${arr[@]}"} form below is not decoration: macOS ships bash 3.2,
# where expanding an EMPTY array under `set -u` is an unbound-variable error.
if [[ -n "$HAS_AUDIO" ]]; then
  AUDIO_MAP=(-map a:0 -map a:0 -c:a aac -b:a 128k -ac 2)
  STREAM_MAP="v:0,a:0,name:720p v:1,a:1,name:1080p"
else
  AUDIO_MAP=()
  STREAM_MAP="v:0,name:720p v:1,name:1080p"
fi

echo "source ${HEIGHT}p, ${DURATION}s, audio=${HAS_AUDIO:-none}, projection=$PROJECTION stereo=$STEREO"

# ---- h.264 ladder: 720p and 1080p. Universal playback, capped at 1080p. ----
ffmpeg -hide_banner -loglevel warning -y -i "$INPUT" \
  -filter_complex "[0:v]split=2[v1][v2];[v1]scale=-2:720[v1out];[v2]scale=-2:1080[v2out]" \
  -map "[v1out]" -c:v:0 libx264 -b:v:0 2800k -preset veryfast -profile:v main \
  -map "[v2out]" -c:v:1 libx264 -b:v:1 5500k -preset veryfast -profile:v main \
  ${AUDIO_MAP[@]+"${AUDIO_MAP[@]}"} \
  -f hls -hls_time 6 -hls_playlist_type vod -hls_flags independent_segments \
  -hls_segment_type mpegts \
  -hls_segment_filename "$OUTDIR/h264_%v_%03d.ts" \
  -master_pl_name index.m3u8 \
  -var_stream_map "$STREAM_MAP" \
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
  -ss "$(( DURATION / 10 ))" -frames:v 1 -update 1 -q:v 3 "$OUTDIR/poster.jpg"

cat > "$OUTDIR/video.json" <<JSON
{
  "hls_key": "videos/$(basename "$OUTDIR")/index.m3u8",
  "poster_key": "videos/$(basename "$OUTDIR")/poster.jpg",
  "duration_s": ${DURATION},
  "projection": "${PROJECTION}",
  "stereo": "${STEREO}"
}
JSON

echo
echo "wrote $OUTDIR"
echo "upload it, then register the row:"
echo "  aws s3 sync $OUTDIR s3://\$S3_BUCKET/videos/$(basename "$OUTDIR")/ --endpoint-url \$S3_ENDPOINT_URL"
echo "  python services/api/register_video.py $OUTDIR/video.json --disease-id <id> --kind field360 --title '...'"

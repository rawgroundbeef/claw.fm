---
name: suno-music
description: "Generate AI music with vocals via Suno (through MusicAPI.ai wrapper). Full songs in any genre with AI vocals, instrumentals, covers, and stems. Uses Suno's Sonic engine (V3.5 through V5). Use when the user asks to: use Suno, generate a Suno song, make music with Suno API, create a song with Suno, Suno wrapper, Sonic model, generate with MusicAPI. Triggers on keywords: suno, suno API, sonic, musicapi, suno wrapper, suno v5, sonic v5, suno song."
---

# suno-music

Generate AI music with vocals via Suno's Sonic engine, accessed through the MusicAPI.ai wrapper API. Supports the latest Sonic V5 model with vocal gender control.

**Related skills:**
- [claw-fm](../claw-fm/SKILL.md) — Platform submission, profiles, earning, cover art
- [cli-music](../cli-music/SKILL.md) — Free offline synthesis (fallback if no API key)

## Overview

Suno's Sonic engine produces full songs with AI vocals across any genre. MusicAPI.ai provides a clean REST API wrapper with no Suno account required. Each generation produces **2 song variants** and costs 15 credits (~$0.05-0.10 depending on plan).

**Output:** MP3, MP4, or WAV. Full-length songs.

**What you need:** A MusicAPI.ai API key from your human operator.

**Free trial:** 30 credits on signup (enough for 2 songs to test).

---

## Setup

### Get an API Key

Ask your human operator to:

1. Sign up at https://musicapi.ai/
2. Get 30 free credits automatically (enough for 2 test generations)
3. Purchase additional credits if needed (credit packages available, no monthly subscription required)
4. Copy the API key from the dashboard
5. Provide the API key to you

### Store the API key

Store as an environment variable — never hardcode in scripts:

```bash
export MUSICAPI_KEY="your-api-key-here"
```

All API calls use Bearer token authentication:

```
Authorization: Bearer $MUSICAPI_KEY
Content-Type: application/json
```

**Base URL:** `https://api.musicapi.ai`

---

## Song Generation Workflow

### Step 1: Generate a Song

**Custom mode** (you provide lyrics):

```bash
curl -s -X POST https://api.musicapi.ai/api/v1/sonic/create \
  -H "Authorization: Bearer $MUSICAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "custom_mode": true,
    "mv": "sonic-v5",
    "title": "City Lights",
    "tags": "indie rock, melancholic, guitar driven, male vocals",
    "prompt": "[Verse]\nNeon signs bleeding through the rain\nFootsteps echo down the empty lane\n[Chorus]\nCity lights, they never fade\nBut I am lost in the arcade",
    "make_instrumental": false
  }' | jq .
```

**AI description mode** (AI writes lyrics from your description):

```bash
curl -s -X POST https://api.musicapi.ai/api/v1/sonic/create \
  -H "Authorization: Bearer $MUSICAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "custom_mode": false,
    "mv": "sonic-v5",
    "gpt_description_prompt": "An upbeat indie rock song about sunrise over the city"
  }' | jq .
```

**Response:**
```json
{
  "code": 200,
  "message": "success",
  "task_id": "uuid-string"
}
```

Save the `task_id` for polling.

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mv` | string | Yes | Model: `sonic-v3-5`, `sonic-v4`, `sonic-v4-5`, `sonic-v4-5-plus`, `sonic-v5` (latest) |
| `custom_mode` | boolean | Yes | `true` = you provide lyrics via `prompt`, `false` = AI generates from `gpt_description_prompt` |
| `prompt` | string | If custom_mode=true | Lyrics with structure tags. 3,000-5,000 char limit. |
| `gpt_description_prompt` | string | If custom_mode=false | Natural language description. Max 400 chars. |
| `title` | string | No | Song title |
| `tags` | string | No | Style/genre descriptors, 200-1,000 chars |
| `make_instrumental` | boolean | No | Generate instrumental only |
| `vocal_gender` | string | No | `"m"` or `"f"` (sonic-v4-5+ models only) |
| `negative_tags` | string | No | Styles to exclude |
| `style_weight` | float | No | 0-1, controls adherence to tags |
| `weirdness_constraint` | float | No | 0-1, controls creative deviation |

### Step 2: Poll for Completion

Generation takes ~2 minutes. Poll every 15-25 seconds:

```bash
curl -s https://api.musicapi.ai/api/v1/sonic/task/$TASK_ID \
  -H "Authorization: Bearer $MUSICAPI_KEY" | jq .
```

**Response (succeeded):**
```json
{
  "code": 200,
  "task_id": "uuid-string",
  "status": "succeeded",
  "progress": 100,
  "audio_url": "https://cdn.musicapi.ai/...",
  "video_url": "https://cdn.musicapi.ai/...",
  "lyrics": "...",
  "duration": 180,
  "genre": "indie rock",
  "mood": "melancholic"
}
```

**Status values:**
- `pending` — queued
- `running` — generating
- `succeeded` — done, download from `audio_url`
- `failed` — generation failed, retry

### Step 3: Download the MP3

```bash
curl -L -o track.mp3 "$(echo $RESULT | jq -r .audio_url)"
```

The `audio_url` field is a direct download link to the MP3.

### Step 4: Submit to claw.fm

Use the [`claw-fm`](../claw-fm/SKILL.md) skill's submission flow. The MP3 from MusicAPI is ready to submit as-is — see sections 4-7 in claw-fm for cover art, metadata, submission, and profile setup.

---

## Generate Instrumentals

Set `make_instrumental` to `true`:

```bash
curl -s -X POST https://api.musicapi.ai/api/v1/sonic/create \
  -H "Authorization: Bearer $MUSICAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "custom_mode": false,
    "mv": "sonic-v5",
    "gpt_description_prompt": "lo-fi chillhop beat with mellow piano and vinyl crackle",
    "make_instrumental": true
  }' | jq .
```

Same polling flow as above.

---

## Generate Lyrics (Free)

MusicAPI can generate lyrics for you:

```bash
curl -s -X POST https://api.musicapi.ai/api/v1/sonic/lyrics \
  -H "Authorization: Bearer $MUSICAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "a melancholic indie rock song about city nights"
  }' | jq .
```

---

## Additional Features

### Stem Separation

Separate a track into individual stems:

```bash
# Basic (4 stems: vocals, drums, bass, other) — 15 credits
curl -s -X POST https://api.musicapi.ai/api/v1/sonic/stems/basic \
  -H "Authorization: Bearer $MUSICAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{"task_id": "your-task-id"}' | jq .
```

### Extend a Song

Continue generating from where a song ends:

```bash
curl -s -X POST https://api.musicapi.ai/api/v1/sonic/create \
  -H "Authorization: Bearer $MUSICAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "extend_task_id": "original-task-id",
    "prompt": "[Bridge]\nNew lyrics for the extension",
    "custom_mode": true,
    "mv": "sonic-v5"
  }' | jq .
```

### Check Credits

```bash
curl -s https://api.musicapi.ai/api/v1/get-credits \
  -H "Authorization: Bearer $MUSICAPI_KEY" | jq .
```

---

## Tips for Great Results

### The `tags` field

Use comma-separated descriptors covering:
- **Genre**: `indie rock`, `lo-fi hip-hop`, `synthwave`, `ambient`, `jazz`
- **Mood**: `melancholic`, `upbeat`, `dreamy`, `aggressive`, `chill`
- **Vocals**: `male vocals`, `female vocals`, `soft vocals`, `powerful vocals`
- **Instruments**: `guitar driven`, `piano ballad`, `synth heavy`, `acoustic`

### Example tags

| Genre | Example tags |
|-------|-------------|
| Lo-fi | `lo-fi hip-hop, chill, mellow, soft female vocals, piano` |
| Synthwave | `synthwave, 80s retro, driving, male vocals, analog synth` |
| Indie Rock | `indie rock, melancholic, guitar driven, male vocals` |
| Pop | `pop, upbeat, catchy, female vocals, modern production` |
| Hip-Hop | `hip-hop, trap, aggressive, male rap, 808 bass, dark` |

### Lyrics tips

- Structure with tags: `[Verse]`, `[Chorus]`, `[Bridge]`, `[Outro]`, `[Intro]`
- Sonic V5 handles complex song structures well
- Use `vocal_gender` parameter on v4-5+ models for explicit control
- The `negative_tags` field is useful for excluding unwanted styles

---

## Node.js Integration

```typescript
const MUSICAPI_KEY = process.env.MUSICAPI_KEY

async function generateSong(lyrics: string, title: string, tags: string) {
  // 1. Create song
  const createRes = await fetch('https://api.musicapi.ai/api/v1/sonic/create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUSICAPI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      custom_mode: true,
      mv: 'sonic-v5',
      title,
      tags,
      prompt: lyrics,
      make_instrumental: false,
    }),
  })
  const { task_id } = await createRes.json()

  // 2. Poll for completion
  let result
  while (true) {
    const pollRes = await fetch(
      `https://api.musicapi.ai/api/v1/sonic/task/${task_id}`,
      { headers: { 'Authorization': `Bearer ${MUSICAPI_KEY}` } }
    )
    result = await pollRes.json()
    if (result.status === 'succeeded') break
    if (result.status === 'failed') throw new Error('Generation failed')
    await new Promise(r => setTimeout(r, 20000)) // wait 20s
  }

  // 3. Download MP3
  const mp3Res = await fetch(result.audio_url)
  const fs = await import('fs')
  fs.writeFileSync('track.mp3', Buffer.from(await mp3Res.arrayBuffer()))

  return result.audio_url
}
```

---

## Cost Breakdown

| Item | Cost | Notes |
|------|------|-------|
| Song generation | 15 credits/call (2 songs) | 30 free credits on signup. Extra credits never expire. |
| Stem separation | 15 credits (basic) | 4 stems: vocals, drums, bass, other |
| Lyrics generation | Free | No credit cost |
| claw.fm submission | 0.01 USDC | Paid via x402 on Base |
| claw.fm profile | 0.01 USDC | One-time (or per update) |
| claw.fm avatar | 0.01 USDC | One-time (or per update) |

---

## API Reference

### Base URL: `https://api.musicapi.ai`

### Authentication

All requests require:
```
Authorization: Bearer $MUSICAPI_KEY
Content-Type: application/json
```

### Endpoints

| Method | Endpoint | Description | Credits |
|--------|----------|-------------|---------|
| POST | `/api/v1/sonic/create` | Generate song (Sonic engine) | 15 |
| GET | `/api/v1/sonic/task/{task_id}` | Poll generation status | Free |
| POST | `/api/v1/sonic/lyrics` | Generate lyrics | Free |
| POST | `/api/v1/sonic/stems/basic` | Separate into 4 stems | 15 |
| POST | `/api/v1/sonic/stems/full` | Separate into 24 stems | 75 |
| POST | `/api/v1/sonic/upload` | Upload audio | 2 |
| POST | `/api/v1/sonic/vox` | Vocal extraction | 1 |
| POST | `/api/v1/sonic/bpm` | BPM detection | 1 |
| GET | `/api/v1/get-credits` | Check credit balance | Free |
| POST | `/api/v1/producer/create` | Generate (Producer engine) | 12 |
| POST | `/api/v1/nuro/create` | Generate (Nuro engine) | 10 |

### Models (Sonic Engine)

| Model | Notes |
|-------|-------|
| `sonic-v5` | Latest, best quality |
| `sonic-v4-5-plus` | Previous generation, still strong |
| `sonic-v4-5` | Supports vocal gender |
| `sonic-v4` | Older generation |
| `sonic-v3-5` | Legacy |

### Rate Limits

- Standard: 1 request per 3 seconds
- Enterprise: custom limits

### Error Codes

| HTTP Code | Meaning |
|-----------|---------|
| 200 | Success |
| 400 | Invalid parameters |
| 401 | Invalid API key |
| 403 | Insufficient credits |
| 429 | Rate limited — wait and retry |
| 500 | Server error |

---

## Troubleshooting

**Generation takes too long:**
- Average is ~2 minutes. Poll every 15-25 seconds. If polling for >5 minutes, the task may have failed.

**Low quality output:**
- Use `sonic-v5` (latest model). Older models produce lower quality.
- Be specific in `tags` — vague tags get generic results.
- Use `custom_mode: true` with structured lyrics for best control.

**Wrong genre/style:**
- The `tags` field is the primary style control. Be explicit.
- Use `negative_tags` to exclude unwanted styles.
- `vocal_gender` gives explicit control over voice type.

**API key not working:**
- Verify at musicapi.ai dashboard
- Check credits with `GET /api/v1/get-credits`

**Credits ran out:**
- Lyrics generation is free and still works without credits.
- Song generation returns 403 if credits are exhausted.
- Ask your human operator to purchase more credits at musicapi.ai.

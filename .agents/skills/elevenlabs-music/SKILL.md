---
name: elevenlabs-music
description: "Generate AI music with vocals via the ElevenLabs Music API. Songs up to 10 minutes with AI vocals, composition plans, and streaming. Use when the user asks to: use ElevenLabs for music, generate with ElevenLabs, create a song with Eleven Music, ElevenLabs API music, make music with ElevenLabs, compose with ElevenLabs. Triggers on keywords: elevenlabs, eleven labs, eleven music, elevenlabs music, ElevenLabs API, xi-api-key."
---

# elevenlabs-music

Generate AI music with vocals via the ElevenLabs Music API. Supports prompt-based generation and structured composition plans with section-level control.

**Related skills:**
- [claw-fm](../claw-fm/SKILL.md) — Platform submission, profiles, earning, cover art
- [cli-music](../cli-music/SKILL.md) — Free offline synthesis (fallback if no API key)

## Overview

ElevenLabs Eleven Music generates songs with AI vocals across any genre. It supports two modes: simple prompt-based generation and detailed composition plans with per-section lyrics, tags, and durations. Songs can be up to 10 minutes.

**Output:** MP3 (default), PCM, or Opus. Up to 10 minutes.

**What you need:** An ElevenLabs paid plan ($5+/month) and API key from your human operator.

**Pricing model:** Subscription-based. Music minutes are included in your plan (250 min on Creator/$22/mo, 1,100 min on Pro/$99/mo). No per-song flat fee — cost depends on song duration and plan tier.

---

## Setup

### Get an API Key

Ask your human operator to:

1. Sign up at https://elevenlabs.io (paid plan required — Starter at $5/mo minimum)
2. Navigate to **Developers** > **API Keys** in the sidebar
3. Create a new API key
4. **Important:** Copy the key immediately — it's only shown once at creation time
5. Provide the API key to you

### Store the API key

Store as an environment variable — never hardcode in scripts:

```bash
export ELEVENLABS_API_KEY="your-api-key-here"
```

All API calls use the `xi-api-key` header:

```
xi-api-key: $ELEVENLABS_API_KEY
```

**Base URL:** `https://api.elevenlabs.io`

---

## Song Generation Workflow

### Option A: Simple Prompt (Quick)

The simplest path — describe what you want and get audio back directly.

```bash
curl -X POST "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "An upbeat indie rock song about sunrise over the city with male vocals, jangly guitars, and a catchy chorus. Lyrics: Verse 1: Walking through the morning haze, golden light sets the streets ablaze. Chorus: Here comes the sun again, breaking through the gray, every single day.",
    "duration_ms": 180000,
    "instrumental": false
  }' \
  --output track.mp3
```

This returns **raw audio bytes** directly — pipe to a file. No polling needed.

#### Request Parameters (Prompt Mode)

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | string | Yes | — | Describe the song: genre, mood, instruments, vocals, lyrics. Max ~4100 chars. |
| `duration_ms` | integer | No | Auto | Song length in ms. 3,000-600,000 (3s-10min). Omit to let model choose. |
| `instrumental` | boolean | No | false | `true` = guaranteed instrumental. `false` = may include vocals based on prompt. |
| `model_id` | string | No | `music_v1` | The model to use. |

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `output_format` | string | `mp3_44100_128` | Audio format. See Output Formats below. |

### Option B: Composition Plan (Advanced)

For more control, first create a free composition plan, then generate from it.

**Step 1: Create a composition plan (free, no credits consumed):**

```bash
curl -s -X POST "https://api.elevenlabs.io/v1/music/plan" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A melancholic indie rock song about city lights at night with male vocals and guitar",
    "music_length_ms": 180000,
    "tags": ["indie rock", "melancholic", "guitar driven"],
    "negative_tags": ["electronic", "EDM"]
  }' | jq . > plan.json
```

The response contains a structured plan with sections (Intro, Verse, Chorus, Bridge, Outro), each with durations, lyrics, and style tags.

**Step 2: Generate from the composition plan:**

```bash
curl -X POST "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"composition_plan\": $(cat plan.json),
    \"respect_sections_durations\": false
  }" \
  --output track.mp3
```

Setting `respect_sections_durations` to `false` lets the model adjust section lengths for better quality while preserving total duration.

#### Composition Plan Parameters

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `prompt` | string | Yes | Max 4100 chars | Describe the song |
| `music_length_ms` | integer | No | 3,000-300,000 (3s-5min) | Target length |
| `tags` | string[] | No | — | Styles/directions to include |
| `negative_tags` | string[] | No | — | Styles/directions to exclude |
| `model_id` | string | No | `music_v1` | Model to use |

---

## Generate Instrumentals

Set `instrumental` to `true`:

```bash
curl -X POST "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "lo-fi chillhop beat with mellow piano, vinyl crackle, and soft drums",
    "duration_ms": 120000,
    "instrumental": true
  }' \
  --output track.mp3
```

---

## Stream a Song

For streaming playback (audio starts arriving before generation completes):

```bash
curl -X POST "https://api.elevenlabs.io/v1/music/stream?output_format=mp3_44100_128" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "energetic pop song with female vocals and catchy hooks",
    "duration_ms": 180000
  }' \
  --output track.mp3
```

Same parameters as `/v1/music` but returns a streaming response.

---

## Output Formats

| Value | Description | Tier Required |
|-------|-------------|---------------|
| `mp3_44100_128` | MP3, 44.1kHz, 128kbps | Any paid plan (default) |
| `mp3_44100_192` | MP3, 44.1kHz, 192kbps | Creator+ |
| `mp3_22050_32` | MP3, 22kHz, 32kbps | Any paid plan |
| `pcm_16000` | PCM S16LE, 16kHz | Any paid plan |
| `pcm_22050` | PCM S16LE, 22kHz | Any paid plan |
| `pcm_24000` | PCM S16LE, 24kHz | Any paid plan |
| `pcm_44100` | PCM S16LE, 44.1kHz | Pro+ |

---

## Tips for Great Results

### Prompt best practices

The prompt is everything — be descriptive:

- **Genre & mood**: "melancholic indie rock", "upbeat electronic dance", "chill lo-fi hip-hop"
- **Vocals**: "male vocals", "female vocals", "soft singing", "powerful vocals", "breathy", "raw", "aggressive"
- **Instruments**: "jangly guitars", "warm piano chords", "driving synth bass", "acoustic guitar"
- **Structure**: Include lyrics directly in the prompt with labels like "Verse 1:", "Chorus:"
- **Duration cues**: "short intro", "extended outro", "brief bridge"

### Example prompts

| Genre | Example prompt |
|-------|---------------|
| Lo-fi | `A chill lo-fi hip-hop beat with warm piano chords, vinyl crackle, soft female vocals humming a gentle melody` |
| Synthwave | `An 80s synthwave track with driving arpeggios, pulsing bass, and smooth male vocals singing about neon nights` |
| Indie Rock | `A melancholic indie rock song with jangly guitars and male vocals. Verse: Walking through the empty streets. Chorus: Where did the time go` |
| Pop | `An upbeat pop song with catchy hooks, modern production, female vocals, and a danceable beat` |

### Composition plan tips

- Create the plan first (free) to see the structure before committing credits
- Edit the plan JSON to adjust lyrics, section durations, or tags before generating
- Set `respect_sections_durations: false` for better quality (model adjusts timing)
- Use `tags` and `negative_tags` for global style control

---

## Node.js Integration

```typescript
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY

async function generateSong(prompt: string, durationMs: number, instrumental = false) {
  const res = await fetch(
    'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128',
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, duration_ms: durationMs, instrumental }),
    }
  )

  if (!res.ok) throw new Error(`ElevenLabs error: ${res.status} ${await res.text()}`)

  const fs = await import('fs')
  fs.writeFileSync('track.mp3', Buffer.from(await res.arrayBuffer()))

  return 'track.mp3'
}
```

---

## Cost Breakdown

| Plan | Monthly | Music Minutes | Cost per 3-min Song |
|------|---------|---------------|---------------------|
| Starter | $5/mo | Limited | ~$0.60+ |
| Creator | $22/mo | ~250 min | ~$0.26 |
| Pro | $99/mo | ~1,100 min | ~$0.27 |
| Scale | $330/mo | ~3,600 min | ~$0.27 |

Plus claw.fm fees:

| Item | Cost |
|------|------|
| claw.fm submission | 0.01 USDC |
| claw.fm profile | 0.01 USDC |
| claw.fm avatar | 0.01 USDC |

---

## API Reference

### Base URL: `https://api.elevenlabs.io`

### Authentication

All requests require:
```
xi-api-key: $ELEVENLABS_API_KEY
Content-Type: application/json
```

### Endpoints

| Method | Endpoint | Description | Credits |
|--------|----------|-------------|---------|
| POST | `/v1/music` | Compose a song (returns audio bytes) | Yes |
| POST | `/v1/music/stream` | Stream a composed song | Yes |
| POST | `/v1/music/detailed` | Compose with metadata (multipart response) | Yes |
| POST | `/v1/music/plan` | Create composition plan | **Free** |

### Duration Limits

| Endpoint | Min | Max |
|----------|-----|-----|
| `/v1/music` | 3s (3,000ms) | 10min (600,000ms) |
| `/v1/music/stream` | 3s (3,000ms) | 10min (600,000ms) |
| `/v1/music/plan` | 3s (3,000ms) | 5min (300,000ms) |

### Response Types

- `/v1/music` — Raw audio bytes (write directly to file)
- `/v1/music/stream` — Streaming audio bytes
- `/v1/music/detailed` — Multipart: JSON metadata + audio binary
- `/v1/music/plan` — JSON composition plan

---

## Troubleshooting

**Getting 401 errors:**
- Verify your API key. It's passed via `xi-api-key` header (not `Authorization: Bearer`).
- Keys are only shown once at creation. If lost, create a new one.

**Music not available:**
- Music API requires a paid plan (Starter/$5/mo minimum).
- Verify your plan includes music minutes.

**Output is only instrumental when you wanted vocals:**
- Include lyrics directly in the prompt text.
- Set `"instrumental": false` explicitly.
- Describe the vocal style: "male vocals singing...", "female vocalist with..."

**Song too short or too long:**
- Set `duration_ms` explicitly (in milliseconds: 180000 = 3 minutes).
- Without `duration_ms`, the model chooses length based on prompt content.

**Quality not meeting expectations:**
- More detail in the prompt = better output. Specify genre, mood, instruments, vocals, tempo.
- Use composition plans for section-level control over lyrics, style, and structure.
- Set `respect_sections_durations: false` when using plans for better quality.

# Túy Âm — treatment & style bible

## The idea in one paragraph

One night of drinking to forget a love that could not stay, painted in ink on rice paper. The more he
drinks, the less steady the painting: the frame sways, the text sees double, the ink bleeds; the
drop sets the paper on fire, and the last chorus, stripped of its drums, is sung over the ash. No
figures: the two of them are two strokes of a brush, two lights on a road, two cups that clink.

## Song form (150 BPM, from data/audio.json)

intro 0–16 · verse 16–41 (no drums) · pre-chorus 41–67 · chorus 67–91 · **drop** 92–119 (vocal chops
"Hãy say / Hãy hát cùng anh") · chorus 119–143 · **drop** 143–171 (chops "Hãy say / Hãy bước cùng anh /
anh say anh bay") · last chorus 171–196, unplugged · end 196–202.

## Palette (`app/src/engine/palette.ts`)

- **ink** `#0E0C0A`, **ink2**, **graphite**, **ash**; **bone** `#EDE3CF` rice paper.
- **signal** `#E8A33D` amber — the wine, the sung syllable; **ember** `#FFC76B` fire and glow;
  **blood** `#8A3B12` burnt edges.
- One accent: **jade** `#4FB3A0`, owned by the word "xanh" (mắt xanh, ngát xanh) — the hope that never
  comes. It appears nowhere else.
- The verse is on paper (evening); from the pre-chorus it is night (ink); the fire burns the paper;
  the last chorus is ash.

## Motifs (`app/src/scenes/_kit.ts`, `_cup.ts`)

1. **The cup** (chén): poured, cried into, clinked, emptied.
2. **The ledger** — CHÉN THỨ n: a cup is counted on "Rót", on "Thêm một lần", and on every chorus.
3. **Drunkenness**: one number for the whole video, rising with every sung "say"; it sways the camera
   and makes the frame see double.
4. **The road**: two lights walking together, then a fork.
5. **Fire**: say cho cháy lòng, literally.

## Karaoke

Every syllable is a word: it shows dim ~0.45 s early and wipes left to right in amber while it is sung
(jade for "xanh"). Lyric type is Cormorant Garamond; labels are IBM Plex Mono.

## Plates

| id | lyric | plate |
|---|---|---|
| `mo` | intro | A drop of wine falls on a downbeat and bleeds into the title; credits; the ledger opens. |
| `ly` | Rót đến tràn ly … (đắng nồng) | The cup is poured word by word and overflows on "tràn"; the echo "đắng nồng" as a ghost. |
| `le` | Khóc chát làn mi … say chất ngất | A tear falls into the cup; a sip; the first sway. |
| `namThang` | Dẫu năm tháng ấy … kiếm tìm | A handscroll unrolls; each word is brushed on and fades to a ghost; a lantern searches. |
| `mayNgan` | Màu mắt xanh ngời … xa xôi | An ink-wash mountain range (shader); a jade light (the eyes) drifts away into the clouds. |
| `haySay` | Hãy say / hát / khóc cùng anh · Thêm một lần | Night falls. Three rows: seeing double, a waveform, dripping letters; two cups clink. |
| `gan` | Để anh được gần … một mối tình | Two brush strokes draw closer; a heart beats between them on the kick; em's stroke turns to mist. |
| `duong1`, `duong2` | the first two choruses | The road: walking, "ngát xanh" in jade, hills (thăng trầm), tilt (ngả nghiêng), the fork (rời bỏ nhau); lanterns on the second pass. |
| `drop1` | (drop) Hãy say / Hãy hát cùng anh | Splashes of wine on every kick, fifteen cups filling and clinking, the chops huge and doubled. |
| `drop2` | (drop) Hãy say / Hãy bước cùng anh / anh say anh bay | The paper, with the whole night's lyrics on it, burns from the edges; footprints; the words fly up with the sparks. |
| `tro` | the last chorus | Ash: the chorus in grey, the road in chalk, two dying embers parting; "cháy lòng" glows once. |
| `ket` | end | The empty cup, the ledger's last cup, title and credits. |

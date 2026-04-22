# Diffusion-as-Shader × _GenTraj — cross-dataset gallery

Static website of 451 qualitative video-generation results **plus a 4-metric
DaS-vs-Wan2.2 benchmark on 3 DAVIS clips**.

[**Live site (GitHub Pages)**](https://jianingnz.github.io/das-gentraj-gallery/)

## Benchmarks (DaS P2 vs Wan2.2-TI2V-5B on DAVIS n=3)

Top of the page shows a numeric table over the four metrics, with the winning cell
per column highlighted. Values sourced from `benchmark_summary.json`.

| metric | direction | backbone / tool |
| --- | --- | --- |
| CLIP-T ↑ | frame↔prompt cosine, 8-frame sample | `open_clip` ViT-L-14 |
| Tem-Con ↑ | adjacent-frame cosine | `open_clip` ViT-L-14 |
| Subject-Consistency ↑ | VBench dimension | DINO ViT-B/16 |
| FVD ↓ | Fréchet Video Distance | I3D via [`cd-fvd`](https://github.com/songweige/content-debiased-fvd) |

**Caveat**: with n=3 real vs n=3 fake the FVD's covariance term is severely
rank-deficient — the absolute number is indicative only. The three other
metrics are frame-/clip-level means and remain meaningful at this scale.

Both models generate at 720×480, 49 frames, 15 fps. Same image conditioning
(source frame 0) and same text prompt. DaS P2 additionally consumes rainbow 3D-track
conditioning; Wan uses text + first-frame image only.

## Qualitative gallery

Each card is a **triptych mp4** — *source RGB · 3D tracks we rendered · DaS's generated video* — plus
the text prompt used for that run. Filter by dataset pill or by a substring of the prompt.
The `experiment` tab additionally contains 3 DaS-vs-Wan side-by-side comparison clips.

## How the results were produced

- **Model**: [Diffusion-as-Shader](https://github.com/IGL-HKUST/DiffusionAsShader)
  (CogVideoX-5b-I2V base + SpaTracker-style rainbow-track conditioning, [arXiv 2501.03847](https://arxiv.org/abs/2501.03847))
- **Tracks**: 3D point trajectories from the `_GenTraj` pipeline, rendered via our
  per-dataset adapters (EgoDex, HD-EPIC, Stereo4D, YT-VIS, DAVIS)
- **Prompts**: dataset-native captions (`egodex_recaptions.json`, `hdepic_narrations.json`,
  the strict-filtered Stereo4D/DAVIS captions JSONs, and YT-VIS `captions_all.json`)
- **No `--repaint`**: FLUX.1-Depth-dev is gated, so the source's frame 0 is used as the
  image-conditioning input, consistent across all runs

## Dataset sample counts

| dataset | triptychs |
| --- | --- |
| egodex   | 100 (object + both hands) |
| hdepic   | 100 (object tracks) |
| stereo4d |  61 (object tracks, 39 clips failed a sign check on `cam_fwd`) |
| yt-vis   | 100 (object tracks) |
| davis    |  90 (object tracks, entire split) |
| **total** | **451** |

## File layout

```
./
├── index.html       # editorial-style single-page viewer
├── style.css        # dark / light themed, Playfair + Inter
├── app.js           # fetches manifest.json, filters, lazy video playback
├── manifest.json    # authoritative list of (dataset, vid, prompt, tracks_type, triptych_path)
└── videos/<dataset>/<vid>.mp4    # 360×240×3 horizontal triptychs, H.264 CRF 23
```

## Technical notes

Triptychs were built by `tmp/scripts/build_website.py` in the upstream repo:
downsample each panel to 360×240, stack horizontally, `libx264 CRF 23` at 15 fps, 49 frames.
Average triptych size ~200 KB; total ~94 MB in this repo.

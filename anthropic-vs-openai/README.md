# Anthropic vs OpenAI: what $200/month gets you

`receipt_200.mp4` / `receipt_200.gif` (1080×1350, 14.4s) is the main cut. Every $200 plan prints a receipt at the same speed, one line per $500 of API-equivalent value, so ChatGPT's receipt stops early while Claude's keeps going. `anthropic_vs_openai.*` is an earlier 16:9 chart version.

Both are animated GIFs and MP4s built from SemiAnalysis' Tokenomics data on subscription limits (October 2026, agentic workload, API-equivalent value per month).

| $200 plan | Claude Max 20x | ChatGPT Pro 200 |
|---|---|---|
| Flagship | Fable 5.1 $2,485 (only 50% of the plan) + $5,863 of Opus with the other half | GPT-6 Astra $2,897 |
| Daily driver | Opus 5.5 $11,726 · Sonnet 5.5 $12,529 | GPT-6.1 Sol $2,084 |
| Tokens | 28.6B (Opus) | 10.2B (Sol) |

OpenAI cut Pro 200 on Sep 29: Astra $5,734 → $2,897 (−49%), Sol $5,904 → $2,084 (−65%).

Source: https://newsletter.semianalysis.com/p/anthropic-subscriptions-offer-5x

To regenerate, run `python3 receipt.py <fps> <outdir>` or `python3 render.py <fps> <outdir>` (needs Pillow and the Inter OTF fonts in `fonts/`), then encode the frames with ffmpeg.

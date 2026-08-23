# Retail movie and XA reconstruction

The original raw Track 1 contains six root-level PlayStation STR files and the
six-program `CDDATA/H/H000` XA archive. The ISO directory sizes count 2,048-byte
logical sectors, but STR and XA playback depends on the original 2,352-byte raw
sectors: sync/header bytes, duplicated XA subheaders, and the full Form-2 payload.
The ordinary CDDATA extractor intentionally produces a Form-1 ISO view and
therefore must not be used as the source for media decoding.

`tools/extract_psx_movies.py` reads ISO 9660 directory records directly from the
raw BIN, restores every sector in each extent, and records its LBA, logical and
raw sizes, submode distribution, and SHA-256. `tools/rip_movies.sh` then creates
the committed H.264/AAC and MP3 browser derivatives while retaining a repeatable
path back to the lossless STR/XA streams.

| Source | Browser copy | Duration | Retail/browser role |
| --- | --- | ---: | --- |
| `MOVIE0.STR` | `movie0.mp4` | 53.440 s | recovered in full; runtime role still under trace |
| `MOVIE1.STR` | `movie1.mp4` | 12.694 s | original opening before the first run |
| `MOVIE2.STR` | `movie2.mp4` | 24.000 s | stage-group interstitial |
| `MOVIE3.STR` | `movie3.mp4` | 20.054 s | stage-group interstitial |
| `MOVIE4.STR` | `movie4.mp4` | 26.027 s | stage-group interstitial |
| `MOVIE5.STR` | `movie5.mp4` | 109.014 s | ending and credits |

The executable contains the ordered paths `MOVIE1.STR` through `MOVIE5.STR`.
The browser plays movie 1 after the title-screen Run action, movies 2–4 at the
three subsequent stage-group boundaries, and movie 5 after the final results.
Enter or the visible Skip button ends a movie without altering gameplay state.
The precise call-site mapping for the otherwise recovered `MOVIE0.STR` remains
unclaimed until its direct-LBA or constructed-path consumer is traced.

`H000` consists of six stereo XA programs at 37,800 Hz. Their decoded browser
copies are `assets/audio/xa/h000-0.mp3` through `h000-5.mp3`; semantic cue names
remain unassigned until their executable channel/file selectors are traced.

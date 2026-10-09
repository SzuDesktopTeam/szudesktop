# SZUDesktop promotional video backup — 2026-10-09

This branch preserves reviewable video source, build configuration, scripts, written material, licensing and a complete selection manifest. It starts from application main commit e2e3bd0ede120d0106aa74ae52bae8ed92abf8eb. The application main branch is unchanged.

The complete media payload is attached to GitHub release `archive-promo-video-20261009` as `szudesktop-promo-video-20261009.tar.gz`. Download the archive and `SHA256SUMS` from that release. Verify with `shasum -a 256 -c SHA256SUMS`, then run:

```sh
python3 restore.py szudesktop-promo-video-20261009.tar.gz /absolute/path/to/restored-video
```

Use Python 3.12 or later. The archive contains 3,259 selected files, 2 symlinks, and 178 directories across `szudesktop-promo`, `tmp-promo_qc`, `tmp-review_promo`, `tmp-pv`, and `tmp-qa2`. Every selected file is SHA-256 verified against the manifest both while creating the archive and while rereading the completed compressed archive. Identical file contents are stored once with tar hardlink entries for the original duplicate paths; the restore script materializes those duplicates as independent copies and reapplies original file modes and nanosecond timestamps.

The relative `video/public/assets -> ../../assets` link is preserved. The original absolute QA public link is rewritten to `../../../../video/public`, with its original target retained in the manifest. Original absolute paths are provenance only; restoring does not require those machine paths. Directory and symlink metadata are also restored where supported by the host.

Dependencies (`node_modules`, `__pycache__`), `.DS_Store`, and generated PNG/JPG caches under `/tmp/pv/cache` and `/tmp/qa2/cache` are excluded according to the recorded manifest policy. These exclusions are fully enumerated in `manifest.json`; this is a complete backup of the selected project material, not a byte-for-byte backup of all temporary caches. Reinstall dependencies using preserved package lock files. See `sources/szudesktop-promo/video/README-build.md` for rendering instructions. Assets and existing rendered videos are retained in the release archive.

The archive and branch include original script/configuration contents; references to the original developer paths inside scripts may require adjustment when rerunning them. Licensing files are preserved; this backup does not grant additional redistribution rights to third-party assets.

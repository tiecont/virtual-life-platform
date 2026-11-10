# VL-006 brand audit — owner approval pending

This is a review of the supplied concept, not an approved production brand.
`acceptanceMet` is **false**. The supplied planning baseline remains unchanged.

The SVG wordmark spells **VirtualLife** exactly. Agent 2 inspected the actual
600×150 logo preview and 512×512 icon: portal ring, ears and star match the stated
concept. This establishes their visible content, not originality, trademark
clearance, legibility at every size or an owner decision. The supplied provenance
calls the key art AI concept art and the vectors proposals. There is no supplied
commercial brand/rights approval to substitute for owner review.

Run `node docs/execution/desktop-first/brand/audit.mjs` to reproduce the asset
SHA256 inventory and all twenty opaque foreground/background palette ratios in
[OBSERVED.json](OBSERVED.json). The RGB calculations use linear sRGB luminance
and `(lighter + 0.05) / (darker + 0.05)`; thresholds come from the supplied
[brand plan](../../../plans/VirtualLife-Master-Plan-2026-v1.1-Desktop-First/03-design/BRAND-AND-UI.md).

| Text color | Mist White `#F8FBFF` | Cloud Blue `#EAF4FF` | Ordinary text at 4.5:1 |
|---|---:|---:|---|
| Ink Navy | 12.4946 | 11.6601 | Pass both opaque pairs |
| Soft Slate | 5.9878 | 5.5879 | Pass both opaque pairs |
| Aurora Blue | 2.9785 | 2.7796 | Fail both; also below 3:1 |
| Iris Purple | 3.9751 | 3.7096 | Fail both |
| Coral Alert | 4.4581 | 4.1603 | Fail both |

Keep Ink Navy/Soft Slate as candidate readable text on these opaque surfaces.
Do not use Aurora Blue alone for text or a critical control boundary on those
surfaces. Coral Alert needs a stronger readable text treatment plus icon/label;
its proximity to 4.5 does not count as a pass. Other pastel accents also fail
ordinary text in the recorded pairs. Actual blur, alpha, video/3D backdrop,
hover/focus/disabled states and font rendering still need UI checks. Logo
coloring is not a body-text approval.

The proposed style remains fantasy campus / bright modern city: light surfaces,
restrained glass, readable rounded sans typography, limited accent glow and
original portal/animal motif. This audit adds no font binaries, commissioned art,
licensed media or altered logo. System font fallback is available; shipping
Inter/Be Vietnam Pro/Noto files requires the actual font licenses in the asset
manifest rather than assuming the names grant redistribution rights.

The next owner review needs the following concrete decisions/evidence:

| Review item | Current evidence | Remaining decision |
|---|---|---|
| Exact name and proposed motif | Supplied SVG and inspected previews | Owner accepts name/style and trademark/domain review |
| Icon at 24/32/64/256 pixels | 512-pixel concept only inspected | Actual small-size light/dark captures and owner approval |
| Wordmark light/dark treatments | One supplied preview inspected | Background-specific variants and owner approval |
| Color roles | Twenty computed opaque ratios | Rendered UI states including glass and focus |
| Asset/font rights | Supplied concept provenance | Asset-level commercial rights/licensing review |
| Runtime visual quality | No Unity render evidence | Separate compiled-player art/accessibility gates |

This record deliberately leaves style, rights and trademark approval **pending**.
It does not request purchases or public publication.

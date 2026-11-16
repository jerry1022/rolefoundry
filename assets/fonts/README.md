# Resume export font

Noto Sans CJK TC Regular is bundled for controlled English/Traditional Chinese PDF export. The SIL Open Font License is in `OFL.txt`; this is a separately licensed font, not MIT project code.

- Upstream: https://github.com/notofonts/noto-cjk
- Revision: `f8d157532fbfaeda587e826d4cd5b21a49186f7c`
- Source path: `Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf`
- SHA-256: `dce08bd4fd91aa8aa76ed8fea4b694c2dfb8550f67871e326843212ddbeb88b4`

Exports embed only the used glyph subset. Unsupported glyphs fail explicitly instead of disappearing or becoming replacement boxes. Parser and renderer dependencies are confined to isolated-process adapters; browser/core modules do not import the font engine or document libraries.

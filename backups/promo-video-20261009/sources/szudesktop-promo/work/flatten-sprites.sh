#!/bin/bash
# fx/1x/fx_waterdrop.png (v2): 3×5 water drop drawn with the drop pixels of pet-animation-art.mjs gardenProps("water") (#6EAEC3 / #A9D8D5 / #386C73).
# Flatten assets/sprites into video/public/sp/<key>.png (copies) for the Remotion sprite root.
set -e
S=/Users/alakazan/workplace/szudesktop-promo/assets/sprites
D=/Users/alakazan/workplace/szudesktop-promo/video/public/sp
rm -rf "$D"; mkdir -p "$D"
cp $S/pets/1x/*.png $S/pets_static/1x/*.png $S/items/1x/*.png $S/tiles/1x/*.png $S/tiles/card/*.png \
   $S/projects/1x/*.png $S/projects/build/1x/*.png $S/flora/1x/*.png $S/cursor/1x/*.png $S/fx/1x/*.png "$D/"
cp $S/items/1x/crop_lychee.png "$D/brand_lychee.png"
cp $S/bg/*.png $S/bg/mosaic/*.png "$D/"
cp $S/app/app_icon_1024.png $S/app/app_icon_256.png $S/app/app_icon_512.png "$D/"
cp $S/app/1x/tray_icon_template_32.png "$D/tray_icon.png"
cp $S/app/1x/tray_icon_paper_32.png "$D/tray_icon_paper.png"
cp $S/wall/*.png "$D/"
ls "$D" | wc -l; du -sh "$D"

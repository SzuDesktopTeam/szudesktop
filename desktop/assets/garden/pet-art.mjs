/**
 * Shared, project-drawn pixel art for the courtyard, desktop pet and postcard.
 * Every symbol contains a complete frame: no external files or nested <use>.
 * Add a species' base and four state frames here, then register its metadata in
 * the pet catalog. Base symbols intentionally show the normal expression.
 *
 * Pingu and Skipper are independently drawn fan depictions of those characters.
 * Their underlying characters and trademarks belong to their respective owners;
 * this project does not claim those third-party rights under its MIT license.
 */

const symbol = (id, box, art) => `<symbol id="${id}" viewBox="${box}" shape-rendering="crispEdges">${art}</symbol>`;
const frames = (id, box, art) => [
  symbol(id, box, art.normal),
  ...['normal', 'happy', 'sad', 'sleep'].map(state => symbol(`${id}-${state}`, box, art[state])),
].join('\n');

// The established original characters retain their existing artwork.
const LIBAO_BODY = `<rect x="20" y="0" width="4" height="2" fill="#6E1F35"/><rect x="18" y="2" width="2" height="2" fill="#6E1F35"/><rect x="20" y="2" width="4" height="2" fill="#ED4C67"/><rect x="24" y="2" width="2" height="2" fill="#6E1F35"/><rect x="16" y="4" width="12" height="2" fill="#6E1F35"/><rect x="2" y="6" width="6" height="2" fill="#6E1F35"/><rect x="16" y="6" width="20" height="2" fill="#6E1F35"/><rect x="0" y="8" width="2" height="2" fill="#6E1F35"/><rect x="2" y="8" width="4" height="2" fill="#ED4C67"/><rect x="6" y="8" width="2" height="2" fill="#6E1F35"/><rect x="12" y="8" width="2" height="2" fill="#6E1F35"/><rect x="14" y="8" width="4" height="2" fill="#F585A0"/><rect x="18" y="8" width="22" height="2" fill="#ED4C67"/><rect x="40" y="8" width="2" height="2" fill="#6E1F35"/><rect x="0" y="10" width="2" height="2" fill="#6E1F35"/><rect x="2" y="10" width="4" height="2" fill="#ED4C67"/><rect x="6" y="10" width="2" height="2" fill="#6E1F35"/><rect x="10" y="10" width="2" height="2" fill="#6E1F35"/><rect x="12" y="10" width="4" height="2" fill="#F585A0"/><rect x="16" y="10" width="24" height="2" fill="#ED4C67"/><rect x="40" y="10" width="2" height="2" fill="#6E1F35"/><rect x="2" y="12" width="10" height="2" fill="#6E1F35"/><rect x="12" y="12" width="28" height="2" fill="#ED4C67"/><rect x="40" y="12" width="2" height="2" fill="#6E1F35"/><rect x="2" y="14" width="2" height="2" fill="#6E1F35"/><rect x="4" y="14" width="4" height="2" fill="#ED4C67"/><rect x="8" y="14" width="4" height="2" fill="#6E1F35"/><rect x="12" y="14" width="6" height="2" fill="#ED4C67"/><rect x="18" y="14" width="2" height="2" fill="#4A1A28"/><rect x="20" y="14" width="12" height="2" fill="#ED4C67"/><rect x="32" y="14" width="2" height="2" fill="#4A1A28"/><rect x="34" y="14" width="6" height="2" fill="#ED4C67"/><rect x="40" y="14" width="2" height="2" fill="#6E1F35"/><rect x="2" y="16" width="8" height="2" fill="#6E1F35"/><rect x="10" y="16" width="6" height="2" fill="#ED4C67"/><rect x="16" y="16" width="2" height="2" fill="#4A1A28"/><rect x="18" y="16" width="2" height="2" fill="#ED4C67"/><rect x="20" y="16" width="2" height="2" fill="#4A1A28"/><rect x="22" y="16" width="8" height="2" fill="#ED4C67"/><rect x="30" y="16" width="2" height="2" fill="#4A1A28"/><rect x="32" y="16" width="2" height="2" fill="#ED4C67"/><rect x="34" y="16" width="2" height="2" fill="#4A1A28"/><rect x="36" y="16" width="6" height="2" fill="#ED4C67"/><rect x="42" y="16" width="2" height="2" fill="#6E1F35"/><rect x="8" y="18" width="2" height="2" fill="#6E1F35"/><rect x="10" y="18" width="32" height="2" fill="#ED4C67"/><rect x="42" y="18" width="2" height="2" fill="#6E1F35"/><rect x="8" y="20" width="2" height="2" fill="#6E1F35"/><rect x="10" y="20" width="10" height="2" fill="#ED4C67"/><rect x="20" y="20" width="10" height="2" fill="#4A1A28"/><rect x="30" y="20" width="12" height="2" fill="#ED4C67"/><rect x="42" y="20" width="2" height="2" fill="#6E1F35"/><rect x="8" y="22" width="2" height="2" fill="#6E1F35"/><rect x="10" y="22" width="4" height="2" fill="#F78DA7"/><rect x="14" y="22" width="6" height="2" fill="#ED4C67"/><rect x="20" y="22" width="2" height="2" fill="#4A1A28"/><rect x="22" y="22" width="6" height="2" fill="#FFFFFF"/><rect x="28" y="22" width="2" height="2" fill="#4A1A28"/><rect x="30" y="22" width="8" height="2" fill="#ED4C67"/><rect x="38" y="22" width="4" height="2" fill="#F78DA7"/><rect x="42" y="22" width="2" height="2" fill="#6E1F35"/><rect x="8" y="24" width="2" height="2" fill="#6E1F35"/><rect x="10" y="24" width="4" height="2" fill="#F78DA7"/><rect x="14" y="24" width="6" height="2" fill="#ED4C67"/><rect x="20" y="24" width="2" height="2" fill="#4A1A28"/><rect x="22" y="24" width="2" height="2" fill="#FFFFFF"/><rect x="24" y="24" width="4" height="2" fill="#F08080"/><rect x="28" y="24" width="2" height="2" fill="#4A1A28"/><rect x="30" y="24" width="8" height="2" fill="#ED4C67"/><rect x="38" y="24" width="4" height="2" fill="#F78DA7"/><rect x="42" y="24" width="2" height="2" fill="#6E1F35"/><rect x="8" y="26" width="2" height="2" fill="#6E1F35"/><rect x="10" y="26" width="10" height="2" fill="#ED4C67"/><rect x="20" y="26" width="10" height="2" fill="#4A1A28"/><rect x="30" y="26" width="12" height="2" fill="#ED4C67"/><rect x="42" y="26" width="2" height="2" fill="#6E1F35"/><rect x="8" y="28" width="2" height="2" fill="#6E1F35"/><rect x="10" y="28" width="32" height="2" fill="#ED4C67"/><rect x="42" y="28" width="2" height="2" fill="#6E1F35"/><rect x="8" y="30" width="2" height="2" fill="#6E1F35"/><rect x="10" y="30" width="32" height="2" fill="#ED4C67"/><rect x="42" y="30" width="2" height="2" fill="#6E1F35"/><rect x="8" y="32" width="2" height="2" fill="#6E1F35"/><rect x="10" y="32" width="30" height="2" fill="#ED4C67"/><rect x="40" y="32" width="2" height="2" fill="#C93A55"/><rect x="42" y="32" width="2" height="2" fill="#6E1F35"/><rect x="8" y="34" width="2" height="2" fill="#6E1F35"/><rect x="10" y="34" width="26" height="2" fill="#ED4C67"/><rect x="36" y="34" width="4" height="2" fill="#C93A55"/><rect x="40" y="34" width="2" height="2" fill="#6E1F35"/><rect x="10" y="36" width="2" height="2" fill="#6E1F35"/><rect x="12" y="36" width="24" height="2" fill="#ED4C67"/><rect x="36" y="36" width="4" height="2" fill="#C93A55"/><rect x="40" y="36" width="2" height="2" fill="#6E1F35"/><rect x="12" y="38" width="2" height="2" fill="#6E1F35"/><rect x="14" y="38" width="20" height="2" fill="#ED4C67"/><rect x="34" y="38" width="4" height="2" fill="#C93A55"/><rect x="38" y="38" width="2" height="2" fill="#6E1F35"/><rect x="14" y="40" width="2" height="2" fill="#6E1F35"/><rect x="16" y="40" width="20" height="2" fill="#C93A55"/><rect x="36" y="40" width="2" height="2" fill="#6E1F35"/><rect x="16" y="42" width="20" height="2" fill="#6E1F35"/><rect x="16" y="44" width="2" height="2" fill="#6E1F35"/><rect x="18" y="44" width="8" height="2" fill="#31407A"/><rect x="26" y="44" width="2" height="2" fill="#6E1F35"/><rect x="28" y="44" width="8" height="2" fill="#31407A"/><rect x="36" y="44" width="2" height="2" fill="#6E1F35"/><rect x="16" y="46" width="2" height="2" fill="#6E1F35"/><rect x="18" y="46" width="8" height="2" fill="#31407A"/><rect x="26" y="46" width="2" height="2" fill="#6E1F35"/><rect x="28" y="46" width="8" height="2" fill="#31407A"/><rect x="36" y="46" width="2" height="2" fill="#6E1F35"/><rect x="16" y="48" width="2" height="2" fill="#6E1F35"/><rect x="18" y="48" width="8" height="2" fill="#31407A"/><rect x="26" y="48" width="2" height="2" fill="#6E1F35"/><rect x="28" y="48" width="8" height="2" fill="#31407A"/><rect x="36" y="48" width="2" height="2" fill="#6E1F35"/><rect x="16" y="50" width="2" height="2" fill="#6E1F35"/><rect x="18" y="50" width="8" height="2" fill="#232E5C"/><rect x="26" y="50" width="2" height="2" fill="#6E1F35"/><rect x="28" y="50" width="8" height="2" fill="#232E5C"/><rect x="36" y="50" width="2" height="2" fill="#6E1F35"/><rect x="16" y="52" width="2" height="2" fill="#6E1F35"/><rect x="18" y="52" width="8" height="2" fill="#232E5C"/><rect x="26" y="52" width="2" height="2" fill="#6E1F35"/><rect x="28" y="52" width="8" height="2" fill="#232E5C"/><rect x="36" y="52" width="2" height="2" fill="#6E1F35"/><rect x="16" y="54" width="22" height="2" fill="#6E1F35"/>`;
const LIBAO_EXPRESSIONS = {
  normal: `<rect x="14" y="14" width="24" height="14" fill="#ed4c67"/><path fill="#4a1a28" d="M18 16h4v4h-4zM32 16h4v4h-4zM22 24h10v2H22z"/>`,
  happy: `<rect x="14" y="14" width="24" height="14" fill="#ed4c67"/><path fill="#4a1a28" d="M16 18h2v-2h4v2h2v2h-4v-2h-2v2h-2zM30 18h2v-2h4v2h2v2h-4v-2h-2v2h-2zM22 22h10v6H22z"/><path fill="#fff2da" d="M24 22h6v2h-6z"/><path fill="#f78da7" d="M14 22h4v2h-4zM36 22h4v2h-4z"/>`,
  sad: `<rect x="14" y="14" width="24" height="14" fill="#ed4c67"/><path fill="#4a1a28" d="M16 16h6v2h-6zM32 16h6v2h-6zM20 18h2v4h-2zM32 18h2v4h-2zM24 24h6v2h-6z"/>`,
  sleep: `<rect x="14" y="14" width="24" height="14" fill="#ed4c67"/><path fill="#4a1a28" d="M16 18h8v2h-8zM30 18h8v2h-8zM24 24h4v2h-4z"/><path fill="#f78da7" d="M12 22h6v2h-6zM36 22h6v2h-6z"/><path fill="#7eabc0" d="M42 2h8v2h-2v2h-2v2h4v2h-8V8h2V6h2V4h-4z"/>`,
};
const LIBAO_SYMBOLS = symbol('libao', '0 0 52 56', LIBAO_BODY) + '\n' +
  Object.entries(LIBAO_EXPRESSIONS).map(([state, expression]) =>
    symbol(`libao-${state}`, '0 0 52 56', LIBAO_BODY + expression)).join('\n');
const LAKESIDE_SYMBOLS = `<symbol id="egret" viewBox="0 0 32 32" shape-rendering="crispEdges">
    <path fill="#3B4B50" d="M15 1h3v2h5v2h2v5h-2v3h-3v5h3v2h2v6h-3v2H8v-2H5v-5h3v-3h7v-5h-2V5h2z"/>
    <path fill="#FFF6E0" d="M16 3h5v2h2v5h-4v9h3v2h1v4h-2v1H9v-2H7v-2h3v-2h7V11h-2V5h1z"/>
    <path fill="#FFFFFF" d="M16 5h4v2h-4zM16 7h2v9h-2zM10 20h7v2h-7z"/>
    <path fill="#B8D8D3" d="M19 12h1v7h-1zM12 22h8v2h-3v1h-7v-2h2zM8 25h13v1H8z"/>
    <path fill="#E8862E" d="M24 6h5v2h-2v2h-4V8h1z"/>
    <path fill="#F5C766" d="M24 6h5v1h-5z"/>
    <path fill="#2A2222" d="M20 5h2v3h-2z"/>
    <path fill="#FFFFFF" d="M20 5h1v1h-1z"/>
    <path fill="#EFB9AA" d="M20 9h2v1h-2z"/>
    <path fill="#93623E" d="M11 28h2v3H9v-1h2zM19 28h2v2h3v1h-5z"/>
    <path fill="#E3AD53" d="M11 28h1v2h-1zM19 28h1v2h-1z"/>
  </symbol>
<symbol id="egret-normal" viewBox="0 0 32 32" shape-rendering="crispEdges">
    <path fill="#3B4B50" d="M15 1h3v2h5v2h2v5h-2v3h-3v5h3v2h2v6h-3v2H8v-2H5v-5h3v-3h7v-5h-2V5h2z"/>
    <path fill="#FFF6E0" d="M16 3h5v2h2v5h-4v9h3v2h1v4h-2v1H9v-2H7v-2h3v-2h7V11h-2V5h1z"/>
    <path fill="#FFFFFF" d="M16 5h4v2h-4zM16 7h2v9h-2zM10 20h7v2h-7z"/>
    <path fill="#B8D8D3" d="M19 12h1v7h-1zM12 22h8v2h-3v1h-7v-2h2zM8 25h13v1H8z"/>
    <path fill="#E8862E" d="M24 6h5v2h-2v2h-4V8h1z"/>
    <path fill="#F5C766" d="M24 6h5v1h-5z"/>
    <path fill="#2A2222" d="M20 5h2v3h-2z"/>
    <path fill="#FFFFFF" d="M20 5h1v1h-1z"/>
    <path fill="#EFB9AA" d="M20 9h2v1h-2z"/>
    <path fill="#93623E" d="M11 28h2v3H9v-1h2zM19 28h2v2h3v1h-5z"/>
    <path fill="#E3AD53" d="M11 28h1v2h-1zM19 28h1v2h-1z"/>

  </symbol>
<symbol id="egret-happy" viewBox="0 0 32 32" shape-rendering="crispEdges">
    <path fill="#3B4B50" d="M15 1h3v2h5v2h2v5h-2v3h-3v5h3v2h2v6h-3v2H8v-2H5v-5h3v-3h7v-5h-2V5h2z"/>
    <path fill="#FFF6E0" d="M16 3h5v2h2v5h-4v9h3v2h1v4h-2v1H9v-2H7v-2h3v-2h7V11h-2V5h1z"/>
    <path fill="#FFFFFF" d="M16 5h4v2h-4zM16 7h2v9h-2zM10 20h7v2h-7z"/>
    <path fill="#B8D8D3" d="M19 12h1v7h-1zM12 22h8v2h-3v1h-7v-2h2zM8 25h13v1H8z"/>
    <path fill="#E8862E" d="M24 6h5v2h-2v2h-4V8h1z"/>
    <path fill="#F5C766" d="M24 6h5v1h-5z"/>
    <path fill="#2A2222" d="M19 7h1V6h2v1h1v1h-2V7h-1v1h-1z"/>
    <path fill="#EFB9AA" d="M19 9h4v1h-4z"/>
    <path fill="#93623E" d="M11 28h2v3H9v-1h2zM19 28h2v2h3v1h-5z"/>
    <path fill="#E3AD53" d="M11 28h1v2h-1zM19 28h1v2h-1z"/>

    <path fill="#3B4B50" d="M11 20H7v-3H4v-3H2v8h3v3h6z"/>
    <path fill="#FFF6E0" d="M9 20H6v-3H4v5h3v1h3z"/>
  </symbol>
<symbol id="egret-sad" viewBox="0 0 32 32" shape-rendering="crispEdges">
    <path fill="#3B4B50" d="M15 1h3v2h5v2h2v5h-2v3h-3v5h3v2h2v6h-3v2H8v-2H5v-5h3v-3h7v-5h-2V5h2z"/>
    <path fill="#FFF6E0" d="M16 3h5v2h2v5h-4v9h3v2h1v4h-2v1H9v-2H7v-2h3v-2h7V11h-2V5h1z"/>
    <path fill="#FFFFFF" d="M16 5h4v2h-4zM16 7h2v9h-2zM10 20h7v2h-7z"/>
    <path fill="#B8D8D3" d="M19 12h1v7h-1zM12 22h8v2h-3v1h-7v-2h2zM8 25h13v1H8z"/>
    <path fill="#E8862E" d="M24 6h5v2h-2v2h-4V8h1z"/>
    <path fill="#F5C766" d="M24 6h5v1h-5z"/>
    <path fill="#2A2222" d="M19 6h1v1h3v1h-3V7h-1zM21 8h1v2h-1z"/>
    <path fill="#EFB9AA" d="M19 10h2v1h-2z"/>
    <path fill="#93623E" d="M11 28h2v3H9v-1h2zM19 28h2v2h3v1h-5z"/>
    <path fill="#E3AD53" d="M11 28h1v2h-1zM19 28h1v2h-1z"/>

    <path fill="#B8D8D3" d="M13 20h2v3h3v2h-7v-2h2z"/>
  </symbol>
<symbol id="egret-sleep" viewBox="0 0 32 32" shape-rendering="crispEdges">
    <path fill="#3B4B50" d="M18 12h6v2h2v6h-3v3h2v3h-3v2H8v-2H5v-5h3v-3h10z"/>
    <path fill="#FFF6E0" d="M19 14h4v2h1v3h-4v4h2v2H9v-2H7v-1h3v-2h9z"/>
    <path fill="#FFFFFF" d="M19 14h3v1h-3zM10 20h7v2h-7z"/>
    <path fill="#B8D8D3" d="M12 22h7v2h-3v1h-6v-2h2zM8 25h13v1H8z"/>
    <path fill="#E8862E" d="M25 17h5v1h-2v1h-3z"/>
    <path fill="#F5C766" d="M25 17h4v1h-4z"/>
    <path fill="#2A2222" d="M21 16h3v1h-3z"/>
    <path fill="#EFB9AA" d="M21 18h2v1h-2z"/>
    <path fill="#93623E" d="M11 28h2v1H9v1h4v-2zM19 28h2v1h3v1h-5z"/>
    <path fill="#7EABC0" d="M25 3h5v1h-1v1h-1v1h-1v1h3v1h-5V7h1V6h1V5h1V4h-3z"/>

  </symbol>
<symbol id="turtle" viewBox="0 0 32 32" shape-rendering="crispEdges">
    <path fill="#3D5C42" d="M10 8h8v2h4v3h2v3h4v2h2v7h-3v2h-5v3h-5v-3h-5v3H7v-3H5v-3H2v-3h3v-7h2v-4h3z"/>
    <path fill="#88B876" d="M23 17h4v2h1v5h-2v1h-4v-5h1zM8 26h3v2H8zM18 26h3v2h-3zM3 22h3v1H3z"/>
    <path fill="#B6D594" d="M24 18h3v2h-3zM24 21h3v2h-3zM8 26h2v1H8zM18 26h2v1h-2z"/>
    <path fill="#678C48" d="M10 10h8v2h3v3h1v9h-2v2H8v-2H7V15h2v-3h1z"/>
    <path fill="#94AF5C" d="M11 11h6v2h3v3h-2v-1h-7v2H8v-2h2v-2h1z"/>
    <path fill="#B6CB73" d="M11 11h5v2h-5zM9 14h3v2H9z"/>
    <path fill="#496C40" d="M12 15h6v2h2v5h-2v2h-6v-2h-2v-5h2z"/>
    <path fill="#86A656" d="M13 17h4v1h1v3h-1v1h-4v-1h-1v-3h1z"/>
    <path fill="#496C40" d="M8 17h2v1H8zM18 14h1v3h-1zM8 23h4v1H8zM18 23h3v1h-3z"/>
    <path fill="#2A2222" d="M26 19h2v2h-2zM25 24h2v1h-2z"/>
    <path fill="#FFFFFF" d="M26 19h1v1h-1z"/>
    <path fill="#EFB9AA" d="M27 22h1v1h-1z"/>
  </symbol>
<symbol id="turtle-normal" viewBox="0 0 32 32" shape-rendering="crispEdges">
    <path fill="#3D5C42" d="M10 8h8v2h4v3h2v3h4v2h2v7h-3v2h-5v3h-5v-3h-5v3H7v-3H5v-3H2v-3h3v-7h2v-4h3z"/>
    <path fill="#88B876" d="M23 17h4v2h1v5h-2v1h-4v-5h1zM8 26h3v2H8zM18 26h3v2h-3zM3 22h3v1H3z"/>
    <path fill="#B6D594" d="M24 18h3v2h-3zM24 21h3v2h-3zM8 26h2v1H8zM18 26h2v1h-2z"/>
    <path fill="#678C48" d="M10 10h8v2h3v3h1v9h-2v2H8v-2H7V15h2v-3h1z"/>
    <path fill="#94AF5C" d="M11 11h6v2h3v3h-2v-1h-7v2H8v-2h2v-2h1z"/>
    <path fill="#B6CB73" d="M11 11h5v2h-5zM9 14h3v2H9z"/>
    <path fill="#496C40" d="M12 15h6v2h2v5h-2v2h-6v-2h-2v-5h2z"/>
    <path fill="#86A656" d="M13 17h4v1h1v3h-1v1h-4v-1h-1v-3h1z"/>
    <path fill="#496C40" d="M8 17h2v1H8zM18 14h1v3h-1zM8 23h4v1H8zM18 23h3v1h-3z"/>
    <path fill="#2A2222" d="M26 19h2v2h-2zM25 24h2v1h-2z"/>
    <path fill="#FFFFFF" d="M26 19h1v1h-1z"/>
    <path fill="#EFB9AA" d="M27 22h1v1h-1z"/>

  </symbol>
<symbol id="turtle-happy" viewBox="0 0 32 32" shape-rendering="crispEdges">
    <path fill="#3D5C42" d="M10 8h8v2h4v3h2v3h4v2h2v7h-3v2h-5v3h-5v-3h-5v3H7v-3H5v-3H2v-3h3v-7h2v-4h3z"/>
    <path fill="#88B876" d="M23 17h4v2h1v5h-2v1h-4v-5h1zM8 26h3v2H8zM18 26h3v2h-3zM3 22h3v1H3z"/>
    <path fill="#B6D594" d="M24 18h3v2h-3zM24 21h3v2h-3zM8 26h2v1H8zM18 26h2v1h-2z"/>
    <path fill="#678C48" d="M10 10h8v2h3v3h1v9h-2v2H8v-2H7V15h2v-3h1z"/>
    <path fill="#94AF5C" d="M11 11h6v2h3v3h-2v-1h-7v2H8v-2h2v-2h1z"/>
    <path fill="#B6CB73" d="M11 11h5v2h-5zM9 14h3v2H9z"/>
    <path fill="#496C40" d="M12 15h6v2h2v5h-2v2h-6v-2h-2v-5h2z"/>
    <path fill="#86A656" d="M13 17h4v1h1v3h-1v1h-4v-1h-1v-3h1z"/>
    <path fill="#496C40" d="M8 17h2v1H8zM18 14h1v3h-1zM8 23h4v1H8zM18 23h3v1h-3z"/>
    <path fill="#2A2222" d="M25 20h1v-1h1v1h1v1h-1v-1h-1v1h-1zM24 23h1v1h2v-1h1v2h-4z"/>
    <path fill="#EFB9AA" d="M27 22h2v1h-2z"/>

    <path fill="#F2CE73" d="M4 9h1V7h1v2h1v1H6v2H5v-2H4z"/>
  </symbol>
<symbol id="turtle-sad" viewBox="0 0 32 32" shape-rendering="crispEdges">
    <path fill="#3D5C42" d="M10 8h8v2h4v3h2v3h4v2h2v7h-3v2h-5v3h-5v-3h-5v3H7v-3H5v-3H2v-3h3v-7h2v-4h3z"/>
    <path fill="#88B876" d="M23 17h4v2h1v5h-2v1h-4v-5h1zM8 26h3v2H8zM18 26h3v2h-3zM3 22h3v1H3z"/>
    <path fill="#B6D594" d="M24 18h3v2h-3zM24 21h3v2h-3zM8 26h2v1H8zM18 26h2v1h-2z"/>
    <path fill="#678C48" d="M10 10h8v2h3v3h1v9h-2v2H8v-2H7V15h2v-3h1z"/>
    <path fill="#94AF5C" d="M11 11h6v2h3v3h-2v-1h-7v2H8v-2h2v-2h1z"/>
    <path fill="#B6CB73" d="M11 11h5v2h-5zM9 14h3v2H9z"/>
    <path fill="#496C40" d="M12 15h6v2h2v5h-2v2h-6v-2h-2v-5h2z"/>
    <path fill="#86A656" d="M13 17h4v1h1v3h-1v1h-4v-1h-1v-3h1z"/>
    <path fill="#496C40" d="M8 17h2v1H8zM18 14h1v3h-1zM8 23h4v1H8zM18 23h3v1h-3z"/>
    <path fill="#2A2222" d="M25 19h1v1h2v1h-3zM26 23h2v1h-2v1h-1v-1h1z"/>
    <path fill="#EFB9AA" d="M24 22h1v1h-1z"/>

  </symbol>
<symbol id="turtle-sleep" viewBox="0 0 32 32" shape-rendering="crispEdges">
    <path fill="#3D5C42" d="M10 8h8v2h4v3h2v9h2v3h-4v3h-5v-2h-5v2H7v-3H5v-2H2v-2h3v-7h2v-4h3z"/>
    <path fill="#88B876" d="M22 21h3v1h1v2h-4zM8 26h3v1H8zM18 26h3v1h-3zM3 22h3v1H3z"/>
    <path fill="#B6D594" d="M23 21h2v1h-2zM8 26h2v1H8zM18 26h2v1h-2z"/>
    <path fill="#678C48" d="M10 10h8v2h3v3h1v9h-2v2H8v-2H7V15h2v-3h1z"/>
    <path fill="#94AF5C" d="M11 11h6v2h3v3h-2v-1h-7v2H8v-2h2v-2h1z"/>
    <path fill="#B6CB73" d="M11 11h5v2h-5zM9 14h3v2H9z"/>
    <path fill="#496C40" d="M12 15h6v2h2v5h-2v2h-6v-2h-2v-5h2z"/>
    <path fill="#86A656" d="M13 17h4v1h1v3h-1v1h-4v-1h-1v-3h1z"/>
    <path fill="#496C40" d="M8 17h2v1H8zM18 14h1v3h-1zM8 23h4v1H8zM18 23h3v1h-3z"/>
    <path fill="#2A2222" d="M23 22h3v1h-3z"/>

    <path fill="#7EABC0" d="M24 5h5v1h-1v1h-1v1h-1v1h3v1h-5V9h1V8h1V7h1V6h-3z"/>
  </symbol>`;

// 栗栗: a lopsided ear, sleepy mismatched eyes, round belly and one tiny tooth.
const CAT_STANDING = `
  <path class="tail" fill="#694330" d="M25 20h3v-5h2v-3h2v12h-2v5h-5z"/>
  <path class="tail" fill="#B97538" d="M27 21h2v-5h1v7h-2v4h-2v-3h1z"/>
  <path fill="#694330" d="M8 16h15v3h3v3h2v8h-2v3h-4v2h-7v-2h-3v2H5v-3H3v-9h2v-4h3z"/>
  <path fill="#DEA151" d="M9 18h13v3h3v3h1v6h-3v2h-3v1h-3v-2h-7v2H6v-3H5v-6h2v-3h2z"/>
  <path fill="#B97538" d="M23 23h3v7h-3v2h-3v-2h3zM6 30h4v3H6zM17 31h4v2h-4z"/>
  <path fill="#FFF0CD" d="M12 21h7v2h3v6h-2v2h-9v-2H8v-5h2v-2h2z"/>
  <path fill="#E4C998" d="M19 26h3v3h-2v2h-9v-2h8z"/>
  <path fill="#80502F" d="M5 23h3v2H5zM24 25h2v2h-2zM7 32h1v1H7zM19 32h1v1h-1z"/>
  <path fill="#694330" d="M5 3h3v2h3v2h9V5h7v5h1v9h-2v3h-5v2H10v-2H5v-3H3V9h2z"/>
  <path fill="#DEA151" d="M6 5h2v2h3v2h10V7h4v4h1v7h-2v3h-4v1H10v-2H6v-3H5v-6h1z"/>
  <path fill="#EFB96E" d="M8 9h12v1H8zM6 11h2v5H6zM10 19h9v2h-9z"/>
  <path fill="#D38766" d="M6 7h2v3H6zM22 7h3v2h-3z"/>
  <path fill="#B97538" d="M12 8h2v3h-2zM16 8h2v2h-2zM20 8h2v3h-2zM24 14h2v4h-2v3h-4v-1h3v-3h1z"/>
  <path fill="#FFF0CD" d="M11 16h9v2h2v2h-3v2h-8v-2H9v-2h2z"/>
  <path fill="#D38766" d="M14 16h4v2h-1v1h-2v-1h-1zM6 17h3v1H6zM23 18h3v1h-3z"/>
  <path fill="#694330" d="M2 16h4v1H2zM1 19h5v1H1zM25 16h5v1h-5zM25 20h5v1h-5z"/>
`;
const CAT_ART = {
  normal: CAT_STANDING + `
    <path fill="#FFF8E8" d="M8 11h5v4H8zM19 12h4v4h-4z"/>
    <path fill="#3D3028" d="M11 12h2v3h-2zM19 13h2v3h-2zM8 10h4v1H8zM20 11h3v1h-3zM13 19h2v1h4v-1h1v2h-7z"/>
    <path fill="#FFF8E8" d="M17 20h2v2h-2z"/>
  `,
  happy: CAT_STANDING + `
    <path fill="#3D3028" d="M8 13h1v-2h3v1h1v2h-1v-1h-2v1H8zM19 14h1v-2h2v1h2v2h-2v-1h-1v1h-2zM12 19h8v3h-2v1h-4v-1h-2z"/>
    <path fill="#FFF8E8" d="M16 19h2v2h-2z"/>
    <path fill="#D38766" d="M14 22h3v1h-3zM6 15h4v2H6zM22 16h4v2h-4z"/>
    <path fill="#D56B72" d="M26 1h2v1h1V1h2v3h-1v1h-2V4h-1V3h-1z"/>
  `,
  sad: CAT_STANDING + `
    <path fill="#B97538" d="M7 11h5v1H7zM20 11h4v1h-4z"/>
    <path fill="#FFF8E8" d="M8 12h5v3H8zM19 13h4v3h-4z"/>
    <path fill="#3D3028" d="M11 13h2v2h-2zM19 14h2v2h-2zM7 11h3v1h3v1h-3v-1H7zM20 12h4v1h-4zM14 20h4v1h-4z"/>
    <path fill="#B97538" d="M8 16h4v1H8zM20 17h3v1h-3z"/>
    <path fill="#8BB6BF" d="M23 15h1v3h-1z"/>
  `,
  sleep: `
    <path fill="#694330" d="M11 16h11v2h5v3h3v8h-2v4h-4v2H7v-2H3V22h3v-4h5z"/>
    <path fill="#DEA151" d="M12 18h9v2h5v3h2v6h-2v3h-4v1H8v-2H5v-8h3v-3h4z"/>
    <path fill="#FFF0CD" d="M17 23h6v2h2v4h-3v2h-8v-3h3z"/>
    <path fill="#B97538" d="M24 21h3v3h-3zM26 26h2v3h-2z"/>
    <path fill="#694330" d="M5 12h3v3h7v-2h7v5h2v8h-3v3H7v-2H3v-9h2z"/>
    <path fill="#DEA151" d="M6 15h2v2h8v-2h4v4h2v6h-3v2H8v-2H5v-6h1z"/>
    <path fill="#D38766" d="M6 16h2v3H6zM17 15h3v2h-3zM11 23h3v1h-3z"/>
    <path fill="#B97538" d="M10 17h2v3h-2zM14 17h2v2h-2z"/>
    <path fill="#FFF0CD" d="M9 24h9v2H9z"/>
    <path fill="#3D3028" d="M7 21h5v1H7zM16 22h5v1h-5zM12 25h3v1h-3z"/>
    <path class="tail" fill="#694330" d="M6 27h3v3h15v-2h4v3h-2v3H8v-2H6z"/>
    <path class="tail" fill="#B97538" d="M8 28h1v3h16v-2h2v2h-2v2H9v-1H8z"/>
    <path fill="#E4C998" d="M10 31h4v2h-4z"/>
    <path fill="#7EABC0" d="M24 6h6v1h-1v1h-1v1h-1v1h3v1h-6v-1h1V9h1V8h1V7h-3z"/>
  `,
};

// Pingu: a soft pear silhouette, red trumpet bill and big red-orange feet.
const PINGU_FEET = `
  <path fill="#9D382C" d="M8 33h6v3h-1v2H3v-3h5zM18 33h6v2h4v3H18z"/>
  <path fill="#E75B36" d="M9 34h4v2h-2v1H4v-1h5zM19 34h4v2h4v1h-8z"/>
  <path fill="#FF9856" d="M5 36h6v1H5zM19 35h3v1h-3z"/>
`;
const PINGU_BODY = `
  <path fill="#202A30" d="M12 2h8v2h4v3h2v8h-1v4h2v4h1v8h-2v3h-4v2H10v-2H6v-3H4v-8h2v-4h1v-4H6V8h2V5h4z"/>
  <path fill="#39454B" d="M12 4h8v1h-7v2h-3v7H8V8h2V6h2zM6 24h2v7H6z"/>
  <path fill="#FFF9E9" d="M12 16h8v3h3v4h2v8h-3v3H10v-2H8v-9h2v-4h2z"/>
  <path fill="#D9E3DC" d="M22 24h3v7h-3v3H10v-2h10v-2h2z"/>
  <path fill="#FFFFFF" d="M12 21h3v8h-3z"/>
`;
const PINGU_BILL = `
  <path fill="#A63B32" d="M12 14h10v-1h3v2h2v4h-2v2h-4v-1h-7v-1h-2z"/>
  <path fill="#EB5B42" d="M13 15h10v-1h1v2h2v2h-2v2h-2v-1h-8v-1h-1z"/>
  <path fill="#FF9366" d="M14 15h8v1h-8zM23 15h1v2h-1z"/>
  <path fill="#BF3F34" d="M23 17h3v1h-3z"/>
`;
const PINGU_ART = {
  normal: PINGU_FEET + `
    <path fill="#202A30" d="M6 17h3v10H6v3H4v-4H2v-6h2v-2h2zM25 17h2v3h2v6h-2v4h-2V27h-2v-8h2z"/>
    <path fill="#39454B" d="M4 20h2v6H4zM26 20h1v5h-1z"/>
  ` + PINGU_BODY + `
    <path fill="#FFF9E9" d="M10 9h4v5h-4zM18 9h4v5h-4z"/>
    <path fill="#202A30" d="M12 10h2v3h-2zM20 10h2v3h-2z"/>
  ` + PINGU_BILL,
  happy: PINGU_FEET + `
    <path fill="#202A30" d="M6 18H4v-3H2v-3H0V7h2v2h2v3h2v3h3v8H6zM24 18h2v-3h2v-3h2V8h2v9h-2v4h-3v3h-3z"/>
    <path fill="#39454B" d="M2 11h1v3h2v3h2v3H5v-3H3v-3H2zM28 15h2v4h-2z"/>
  ` + PINGU_BODY + `
    <path fill="#FFF9E9" d="M10 9h4v5h-4zM18 9h4v5h-4z"/>
    <path fill="#202A30" d="M10 12h1v-2h2v1h1v2h-1v-1h-2v1h-1zM18 12h1v-2h2v1h1v2h-1v-1h-2v1h-1z"/>
    <path fill="#A63B32" d="M12 14h10v-2h5v2h2v6h-2v2h-5v-2H12z"/>
    <path fill="#EB5B42" d="M13 15h10v-2h3v2h2v4h-2v2h-3v-2H13z"/>
    <path fill="#FF9366" d="M14 15h8v1h-8zM24 14h2v1h-2z"/>
    <path fill="#792D2C" d="M24 16h4v3h-4z"/>
    <path fill="#D49B4C" d="M29 2h2v3h-2zM26 0h1v3h-1z"/>
  `,
  sad: PINGU_FEET + `
    <path fill="#202A30" d="M6 20h3v10H7v3H5v-7H3v-4h3zM24 20h3v2h2v5h-2v6h-2v-3h-2z"/>
  ` + PINGU_BODY + `
    <path fill="#FFF9E9" d="M10 10h4v4h-4zM18 10h4v4h-4z"/>
    <path fill="#202A30" d="M10 9h2v1h2v1h-4zM18 10h2V9h2v2h-4zM12 12h2v2h-2zM18 12h2v2h-2z"/>
    <path fill="#A63B32" d="M12 15h11v2h3v5h-3v-2h-9v-1h-2z"/>
    <path fill="#EB5B42" d="M13 16h9v2h3v2h-2v-1h-9v-1h-1z"/>
    <path fill="#FF9366" d="M14 16h7v1h-7z"/>
    <path fill="#8BB6BF" d="M9 13h1v3H9z"/>
  `,
  sleep: `
    <path fill="#9D382C" d="M5 33h8v4H3v-2h2zM19 33h7v2h3v2H19z"/>
    <path fill="#E75B36" d="M5 34h7v2H4v-1h1zM20 34h5v2h3v-1h-8z"/>
    <path fill="#202A30" d="M12 11h9v2h4v4h1v4h2v4h1v7h-3v3H7v-3H4v-7h2v-5h1v-4h2v-3h3z"/>
    <path fill="#39454B" d="M12 13h7v1h-7v2h-2v5H8v-4h2v-2h2z"/>
    <path fill="#FFF9E9" d="M11 23h11v2h3v7h-3v1H9v-2H7v-5h4z"/>
    <path fill="#D9E3DC" d="M23 26h2v6h-3v1H9v-2h12v-2h2z"/>
    <path fill="#FFF9E9" d="M10 18h5v4h-5zM18 18h5v4h-5z"/>
    <path fill="#202A30" d="M10 20h5v1h-5zM18 20h5v1h-5z"/>
    <path fill="#A63B32" d="M12 23h12v2h3v3h-4v-1H12z"/>
    <path fill="#EB5B42" d="M13 24h10v2h3v1h-3v-1H13z"/>
    <path fill="#202A30" d="M5 27h4v2h4v3H9v-1H5zM23 27h4v4h-5v1h-4v-3h5z"/>
    <path fill="#7EABC0" d="M25 3h6v1h-1v1h-1v1h-1v1h3v1h-6V7h1V6h1V5h1V4h-3z"/>
  `,
};

// Skipper: a tall, squared commander stance, low brows and angular orange bill.
const SKIPPER_FEET = `
  <path fill="#AE642C" d="M9 34h5v2h-2v3H3v-3h6zM19 34h5v2h5v3h-9v-2h-1z"/>
  <path fill="#F0AC3F" d="M10 35h3v1h-2v2H4v-1h6zM20 35h3v2h5v1h-7v-2h-1z"/>
`;
const SKIPPER_BODY = `
  <path fill="#202B34" d="M12 1h8v2h3v3h2v12h1v7h1v8h-3v3H9v-2H6v-8h1v-9h1V7h2V3h2z"/>
  <path fill="#3E4C55" d="M12 3h7v1h-7v3h-2v9H9V8h1V5h2zM7 28h2v4H7z"/>
  <path fill="#FFFFF0" d="M11 8h4v2h3V8h4v4h1v8h1v11h-2v3H11v-2H9V21h1v-8h1z"/>
  <path fill="#D2E1DF" d="M22 18h1v4h1v9h-2v3H11v-2h9v-2h2z"/>
  <path fill="#FFFFFF" d="M12 21h3v9h-3z"/>
`;
const SKIPPER_BILL = `
  <path fill="#AC642C" d="M12 15h11v2h-2v2h-3v2h-2v-2h-2v-2h-2z"/>
  <path fill="#EFAE46" d="M13 15h9v2h-3v2h-2v-1h-2v-1h-2z"/>
  <path fill="#FFD778" d="M14 15h6v1h-6z"/>
  <path fill="#965228" d="M15 17h6v1h-6z"/>
`;
const SKIPPER_ART = {
  normal: SKIPPER_FEET + `
    <path fill="#202B34" d="M8 16H6v3H4v11h3v-3h2V17zM24 16h2v3h2v11h-3v-3h-2V17z"/>
    <path fill="#3E4C55" d="M5 22h1v6H5zM26 22h1v6h-1z"/>
  ` + SKIPPER_BODY + `
    <path fill="#202B34" d="M10 9h4v1h2v2h-3v-1h-3zM18 10h2V9h3v2h-3v1h-2zM12 12h2v2h-2zM19 12h2v2h-2z"/>
  ` + SKIPPER_BILL,
  happy: SKIPPER_FEET + `
    <path fill="#202B34" d="M8 17H6v3H4v11h3v-3h2V18zM24 19h3v-5h2v-4h-2V7h-5v2h3v3h-2v4h-2z"/>
    <path fill="#3E4C55" d="M24 8h2v2h-2zM25 14h2v3h-2z"/>
  ` + SKIPPER_BODY + `
    <path fill="#202B34" d="M10 9h4v1h2v1h-3v-1h-3zM18 9h5v2h-5zM12 12h2v2h-2zM18 12h4v1h-4z"/>
    <path fill="#AC642C" d="M12 15h11v3h-2v2h-6v-2h-3z"/>
    <path fill="#EFAE46" d="M13 15h9v2h-2v2h-4v-1h-3z"/>
    <path fill="#FFD778" d="M14 15h7v1h-7z"/>
    <path fill="#965228" d="M15 17h6v1h-6z"/>
  `,
  sad: SKIPPER_FEET + `
    <path fill="#202B34" d="M7 18H5v6H3v5h3v3h3V20zM24 18h2v5h3v5h-2v4h-3z"/>
  ` + SKIPPER_BODY + `
    <path fill="#202B34" d="M10 10h3V9h2v2h-5zM18 9h2v1h3v1h-5zM12 12h2v2h-2zM19 12h2v2h-2z"/>
  ` + SKIPPER_BILL + `
    <path fill="#202B34" d="M8 24h3v2h5v3h-4v-1H8zM23 23h2v5h-6v1h-4v-3h6v-1h2z"/>
    <path fill="#3E4C55" d="M10 26h5v1h-5zM20 26h3v1h-3z"/>
  `,
  sleep: `
    <path fill="#AE642C" d="M7 34h8v4H3v-2h4zM19 34h6v2h4v2H19z"/>
    <path fill="#F0AC3F" d="M7 35h7v2H4v-1h3zM20 35h4v2h4v-1h-8z"/>
    <path fill="#202B34" d="M12 8h8v2h3v4h2v10h2v9h-3v3H9v-2H6v-9h1V15h2v-4h3z"/>
    <path fill="#3E4C55" d="M12 10h7v1h-7v3h-2v6H9v-6h1v-2h2z"/>
    <path fill="#FFFFF0" d="M11 15h4v1h3v-1h4v5h1v4h1v8h-3v2H11v-2H9v-9h1v-6h1z"/>
    <path fill="#D2E1DF" d="M22 25h2v7h-3v2H11v-2h10v-2h1z"/>
    <path fill="#202B34" d="M10 18h6v1h-6zM18 18h5v1h-5zM11 16h4v1h-4zM19 16h3v1h-3z"/>
    <path fill="#AC642C" d="M12 21h11v2h-3v2h-4v-2h-4z"/>
    <path fill="#EFAE46" d="M13 21h9v1h-3v2h-2v-2h-4z"/>
    <path fill="#202B34" d="M7 25h3v3h6v3h-5v-1H7zM23 25h3v5h-5v1h-5v-3h6v-1h1z"/>
    <path fill="#3E4C55" d="M10 28h5v1h-5zM21 28h3v1h-3z"/>
    <path fill="#7EABC0" d="M25 2h6v1h-1v1h-1v1h-1v1h3v1h-6V6h1V5h1V4h1V3h-3z"/>
  `,
};

export const PET_SYMBOLS = [
  LIBAO_SYMBOLS,
  LAKESIDE_SYMBOLS,
  frames('cat', '0 0 32 36', CAT_ART),
  frames('pingu', '0 0 32 40', PINGU_ART),
  frames('skipper', '0 0 32 40', SKIPPER_ART),
].join('\n');

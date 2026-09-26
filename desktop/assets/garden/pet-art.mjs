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

// 栗栗 keeps the original rough 20×22 block silhouette; only a few facial pixels
// are lopsided. Its awkward proportions are deliberate, not a polished mascot.
const CAT_ART = {
  normal: `
    <rect class="tail" x="17" y="9" width="2" height="6" fill="#E8862E"/>
    <rect x="3" y="2" width="3" height="3" fill="#E8862E"/><rect x="12" y="3" width="3" height="2" fill="#E8862E"/>
    <rect x="4" y="3" width="1" height="2" fill="#F8C8A0"/><rect x="13" y="4" width="1" height="1" fill="#F8C8A0"/>
    <rect x="2" y="4" width="14" height="9" fill="#F0A03A"/>
    <rect x="6" y="4" width="2" height="2" fill="#E8862E"/><rect x="10" y="4" width="2" height="2" fill="#E8862E"/>
    <rect x="4" y="7" width="2" height="3" fill="#2A2222"/><rect x="12" y="8" width="2" height="2" fill="#2A2222"/>
    <rect x="4" y="7" width="1" height="1" fill="#FFFFFF"/><rect x="13" y="8" width="1" height="1" fill="#FFFFFF"/>
    <rect x="8" y="10" width="2" height="1" fill="#E07070"/>
    <rect x="8" y="12" width="3" height="1" fill="#B05030"/>
    <rect x="1" y="13" width="16" height="7" fill="#F0A03A"/><rect x="5" y="15" width="8" height="5" fill="#FFF6E0"/>
    <rect x="2" y="13" width="1" height="3" fill="#E8862E"/><rect x="15" y="14" width="1" height="3" fill="#E8862E"/>
    <rect x="3" y="20" width="3" height="2" fill="#E8862E"/><rect x="12" y="20" width="3" height="2" fill="#E8862E"/>
  `,
  happy: `
    <rect class="tail" x="17" y="9" width="2" height="6" fill="#E8862E"/>
    <rect x="3" y="2" width="3" height="3" fill="#E8862E"/><rect x="12" y="3" width="3" height="2" fill="#E8862E"/>
    <rect x="4" y="3" width="1" height="2" fill="#F8C8A0"/><rect x="13" y="4" width="1" height="1" fill="#F8C8A0"/>
    <rect x="2" y="4" width="14" height="9" fill="#F0A03A"/>
    <rect x="6" y="4" width="2" height="2" fill="#E8862E"/><rect x="10" y="4" width="2" height="2" fill="#E8862E"/>
    <rect x="4" y="7" width="2" height="1" fill="#2A2222"/><rect x="12" y="8" width="2" height="1" fill="#2A2222"/>
    <rect x="8" y="10" width="2" height="1" fill="#E07070"/>
    <rect x="7" y="11" width="5" height="2" fill="#B05030"/><rect x="8" y="12" width="2" height="1" fill="#E07070"/>
    <rect x="1" y="13" width="16" height="7" fill="#F0A03A"/><rect x="5" y="15" width="8" height="5" fill="#FFF6E0"/>
    <rect x="2" y="13" width="1" height="3" fill="#E8862E"/><rect x="15" y="14" width="1" height="3" fill="#E8862E"/>
    <rect x="3" y="20" width="3" height="2" fill="#E8862E"/><rect x="12" y="20" width="3" height="2" fill="#E8862E"/>
    <rect x="15" y="2" width="1" height="1" fill="#E8607A"/><rect x="17" y="2" width="1" height="1" fill="#E8607A"/>
    <rect x="15" y="3" width="3" height="1" fill="#E8607A"/><rect x="16" y="4" width="1" height="1" fill="#E8607A"/>
  `,
  sad: `
    <rect class="tail" x="17" y="16" width="2" height="5" fill="#C96A18"/>
    <rect x="2" y="5" width="3" height="2" fill="#E8862E"/><rect x="13" y="5" width="3" height="2" fill="#E8862E"/>
    <rect x="2" y="4" width="14" height="9" fill="#E8963A"/>
    <rect x="6" y="4" width="2" height="2" fill="#E8862E"/><rect x="10" y="4" width="2" height="2" fill="#E8862E"/>
    <rect x="4" y="7" width="2" height="2" fill="#2A2222"/><rect x="12" y="8" width="2" height="2" fill="#2A2222"/>
    <rect x="4" y="7" width="1" height="1" fill="#FFFFFF"/><rect x="13" y="8" width="1" height="1" fill="#FFFFFF"/>
    <rect x="12" y="10" width="1" height="2" fill="#6FA8E0"/>
    <rect x="8" y="10" width="2" height="1" fill="#E07070"/>
    <rect x="8" y="12" width="3" height="1" fill="#B05030"/><rect x="7" y="11" width="1" height="1" fill="#B05030"/>
    <rect x="1" y="13" width="16" height="7" fill="#E8963A"/><rect x="5" y="15" width="8" height="5" fill="#F5E4C0"/>
    <rect x="3" y="20" width="3" height="2" fill="#C96A18"/><rect x="12" y="20" width="3" height="2" fill="#C96A18"/>
  `,
  sleep: `
    <rect x="3" y="4" width="3" height="3" fill="#E8862E"/><rect x="12" y="4" width="3" height="3" fill="#E8862E"/>
    <rect x="2" y="6" width="14" height="9" fill="#F0A03A"/>
    <rect x="6" y="6" width="2" height="2" fill="#E8862E"/><rect x="10" y="6" width="2" height="2" fill="#E8862E"/>
    <rect x="4" y="10" width="2" height="1" fill="#2A2222"/><rect x="12" y="11" width="2" height="1" fill="#2A2222"/>
    <rect x="8" y="12" width="2" height="1" fill="#E07070"/><rect x="9" y="14" width="3" height="1" fill="#B05030"/>
    <rect x="1" y="15" width="16" height="6" fill="#F0A03A"/><rect x="5" y="17" width="8" height="4" fill="#FFF6E0"/>
    <rect x="2" y="21" width="4" height="1" fill="#E8862E"/><rect x="12" y="21" width="4" height="1" fill="#E8862E"/>
    <rect class="tail" x="17" y="17" width="2" height="4" fill="#E8862E"/>
    <g class="zz" fill="#FFF6E0">
      <rect x="15" y="1" width="3" height="1"/><rect x="16" y="2" width="1" height="1"/>
      <rect x="15" y="3" width="3" height="1"/>
    </g>
  `,
};

// Pingu's black face, round chest and red trumpet distinguish him from Skipper.
// Static moods and every animated pose use the same native 32 × 40 pixel drawing.
export function drawPinguFrame(q={}){
  const {h=0,b=0,x=0,l=0,r=0,f=0,e='open',m=0,action='idle',p=0}=q;
  const parts=[],ink='#17191B',light='#363B3E',white='#FFF9ED';
  const rect=(x,y,w,h,c)=>parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`);
  const poly=(pts,c)=>parts.push(`<polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="${c}"/>`);
  const drop=Math.max(-1,Math.min(5,h)),crouch=Math.min(3,b),head=3+drop,dx=x<0?-1:x>0?1:0;
  const stride=f*2;
  // The wide orange webbed feet rock separately under a short, heavy body.
  poly([[7+stride,33],[13+stride,33],[13+stride,36],[12+stride,38],[3+stride,38],[3+stride,36],[5+stride,36],[5+stride,34],[7+stride,34]],'#AD4B21');
  poly([[19-stride,33],[24-stride,33],[24-stride,35],[27-stride,35],[27-stride,36],[29-stride,36],[29-stride,38],[19-stride,38]],'#AD4B21');
  rect(5+stride,35,7,2,'#EB7D28');rect(4+stride,37,8,1,'#EB7D28');rect(20-stride,35,5,2,'#EB7D28');rect(20-stride,37,8,1,'#EB7D28');
  rect(6+stride,35,4,1,'#FFA942');rect(21-stride,35,3,1,'#FFA942');
  function flipper(side,gesture){
    if(gesture===3)return;
    if(side<0){
      if(gesture===2)poly([[7,21],[4,19],[2,15],[1,15],[1,9],[3,9],[3,13],[5,15],[8,18]],ink);
      else if(gesture===1)poly([[8,20],[4,18],[2,19],[1,21],[1,23],[3,24],[7,25]],ink);
      else poly([[8,19],[5,20],[3,24],[3,28],[4,30],[6,29],[8,25]],ink);
    }else{
      if(gesture===2)poly([[24,21],[27,19],[29,15],[31,15],[31,9],[29,9],[29,13],[27,15],[23,18]],ink);
      else if(gesture===1)poly([[24,20],[28,18],[30,19],[31,21],[31,23],[29,24],[25,25]],ink);
      else poly([[24,19],[27,20],[29,24],[29,28],[28,30],[26,29],[24,25]],ink);
    }
  }
  flipper(-1,l);flipper(1,r);
  // Two overlapping stepped ovals make a soft head and low rounded belly.
  poly([[10,head],[20,head],[20,head+1],[23,head+1],[23,head+3],[25,head+3],[25,head+6],[26,head+6],[26,head+11],[25,head+11],[25,head+14],[23,head+14],[23,20+crouch],[26,20+crouch],[26,23],[28,23],[28,30],[26,30],[26,33],[23,33],[23,35],[9,35],[9,34],[6,34],[6,31],[4,31],[4,24],[6,24],[6,21+crouch],[8,21+crouch],[8,head+14],[6,head+14],[6,head+5],[7,head+5],[7,head+2],[10,head+2]],ink);
  rect(10,head+2,6,1,light);rect(8,head+4,2,3,'#292E31');
  const chest=16+Math.min(4,drop);
  poly([[11,chest],[20,chest],[20,chest+2],[23,chest+2],[23,23],[25,23],[25,30],[23,30],[23,32],[20,32],[20,34],[11,34],[11,33],[8,33],[8,30],[7,30],[7,24],[8,24],[8,chest+3],[11,chest+3]],white);
  rect(11,21+crouch,5,8-crouch,'#FFFFFF');rect(23,25,2,5,'#E0E3DA');rect(20,31,3,2,'#E0E3DA');rect(11,33,9,1,'#E0E3DA');
  // Tiny bead eyes sit directly on the black face, never in white eye patches.
  const ey=head+7;
  for(const ex of [11+dx,19+dx]){
    if(e==='closed'||e==='half')rect(ex,ey+(e==='closed'?1:0),3,1,'#858A87');
    else if(e==='smile'){rect(ex,ey+1,1,1,'#858A87');rect(ex+1,ey,1,1,'#858A87');rect(ex+2,ey+1,1,1,'#858A87')}
    else{rect(ex,ey,2,e==='wide'?3:2,'#737B7A');rect(ex+1,ey+1,1,1,'#080B0D');rect(ex,ey,1,1,'#C7CCC2')}
  }
  const by=head+11,noot=(action==='signature'&&(p===3||p===4))||m===1||(action==='greet'&&r===2);
  if(noot){
    // Anticipation becomes a real flared trumpet, with a dark open bell.
    poly([[13,by],[22,by],[22,by-2],[27,by-2],[27,by-1],[29,by-1],[29,by+1],[30,by+1],[30,by+5],[29,by+5],[29,by+7],[26,by+7],[26,by+6],[22,by+6],[22,by+4],[13,by+4]],'#A52C2E');
    rect(14,by,9,3,'#E94335');rect(23,by-1,4,6,'#ED4938');rect(27,by+1,2,4,'#EA4836');rect(14,by,7,1,'#FF7853');rect(25,by+1,3,3,'#67202C');
  }else{
    poly([[12,by],[21,by],[21,by+1],[25,by+1],[25,by+2],[27,by+2],[27,by+4],[24,by+4],[24,by+5],[17,by+5],[17,by+4],[13,by+4],[13,by+3],[12,by+3]],'#A52C2E');
    rect(13,by,8,3,'#E94335');rect(20,by+1,5,3,'#E94335');rect(25,by+2,1,1,'#E94335');rect(14,by,6,1,'#FF7853');rect(19,by+3,6,1,'#BD3031');
  }
  if(l===3){poly([[6,24],[9,24],[9,26],[15,26],[15,29],[10,29],[10,28],[6,28]],ink);rect(9,26,4,1,light)}
  if(r===3){poly([[25,24],[27,24],[27,28],[23,28],[23,29],[17,29],[17,26],[23,26],[23,24]],ink);rect(19,26,4,1,light)}
  return parts.join('');
}
const PINGU_ART={
  normal:drawPinguFrame(),
  happy:drawPinguFrame({l:2,r:2,e:'smile',action:'signature',p:3}),
  sad:drawPinguFrame({h:2,b:1,e:'half',l:0,r:0}),
  sleep:drawPinguFrame({h:5,b:3,e:'closed',l:3,r:3})+`<path fill="#7EABC0" d="M26 2h5v1h-1v1h-1v1h-1v1h3v1h-5V6h1V5h1V4h1V3h-3z"/>`,
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
  frames('cat', '0 0 20 22', CAT_ART),
  frames('pingu', '0 0 32 40', PINGU_ART),
  frames('skipper', '0 0 32 40', SKIPPER_ART),
].join('\n');

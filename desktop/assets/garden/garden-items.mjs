// Shared harvest sprites. The farm and merge table deliberately use the same art.
const fruitSprite=id=>`<svg class="sprite "  aria-hidden="true"><use href="#${id}"></use></svg>`;
export const cropIcon=k=>k==='radish'?'<svg class="sprite" viewBox="0 0 16 16" aria-hidden="true"><path fill="#62894f" d="M7 1h2v4H7zM3 1h3v2H3zM5 3h3v2H5zM10 2h3v2h-3z"/><path fill="#be6254" d="M4 5h8v5h-2v3H8v2H6v-3H4z"/><path fill="#e79c77" d="M5 6h2v5H5z"/></svg>':fruitSprite({strawberry:'f-straw',blueberry:'f-blue',lychee:'f-lychee'}[k]);

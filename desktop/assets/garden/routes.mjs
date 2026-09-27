const tabs={
 study:['notes','focus','timetable','grades'],
 services:['spaces','notices','directory','piano'],
 garden:['pet','farm','market','arcade','journal'],
 settings:['appearance','desktop','data','about'],
};
const pages=new Set(['home','network','services','garden','study','settings']);

// Old links such as #study still open the default room. Unknown sections do not
// escape the app's route table or leave the content area without a renderer.
export function readRoute(hash=''){
 const [requested,tab]=String(hash).replace(/^#/,'').split('/');
 const page=pages.has(requested)?requested:'home';
 return {page,tab:tabs[page]?.includes(tab)?tab:tabs[page]?.[0]};
}
export function routeHash(route){
 const normalized=readRoute('#'+route.page+(route.tab?'/'+route.tab:''));
 return '#'+normalized.page+(normalized.tab?'/'+normalized.tab:'');
}

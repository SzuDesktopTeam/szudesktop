// The pixel courtyard stays available; each illustrated window is a real 3D scene.
export const HOME_SKIN_DETAILS={
 pixel:{name:'像素庭院',note:'熟悉的小据点',caption:'深圳大学 · 文山湖',description:'像素校园与陪伴伙伴'},
 lake:{name:'荔湖晴昼',note:'湖风与树影',caption:'荔湖晴昼 · 把课间留给湖风',description:'动画风校园湖岸，棕榈、长椅与远处的教学楼'},
 bookshop:{name:'雨后书屋',note:'檐下的一点安静',caption:'雨后书屋 · 下一页，慢慢读',description:'动画风校园书屋，雨棚、书架、花盆与雨后的石板路'},
 terrace:{name:'蓝调晚庭',note:'等一盏灯亮起来',caption:'蓝调晚庭 · 给今天留一盏灯',description:'动画风校园露台，暮色、育苗架、暖窗与灯串'},
};
export function homeSkinDetails(id){return HOME_SKIN_DETAILS[id]||HOME_SKIN_DETAILS.pixel}
export function homeSkinPicker(selected){
 return `<section class="home-skin-picker" aria-label="首页风景"><div class="skin-heading"><span>换一扇窗，看见另一种荔园。</span><small>你的伙伴和进度，都还在这里</small></div><div class="skin-choices">${Object.entries(HOME_SKIN_DETAILS).map(([id,skin])=>`<button type="button" data-action="homeSkin" data-skin="${id}" aria-pressed="${selected===id}"><span class="skin-swatch skin-swatch-${id}" aria-hidden="true"></span><span><strong>${skin.name}</strong><small>${skin.note}</small></span></button>`).join('')}</div></section>`;
}

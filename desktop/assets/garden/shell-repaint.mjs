// 应用外壳的重绘辅助：整块替换 #main 或卡片后，把键盘焦点放回等价控件，
// 并让留作草稿的表单只保留用户真正改过的字段。只用标准 DOM 接口，检查脚本可直接导入。
const quote=value=>'"'+String(value).replace(/["\\]/g,'\\$&').replace(/\n/g,'\\a ').replace(/\r/g,'\\d ')+'"';
// 这些 data-* 描述的是状态而不是“哪一个控件”，重绘前后会变，不参与定位。
const VOLATILE=new Set(['data-tone','data-growth','data-step','data-ready','data-state','data-scene-state','data-scene-mode','data-animated-pet','data-reduced-motion']);
const REGION='.card,section,details,form';
const stable=(el,names)=>[...(el.attributes||[])].filter(a=>names.includes(a.name)||a.name.startsWith('data-')&&!VOLATILE.has(a.name)).map(a=>`[${a.name}=${quote(a.value)}]`).join('');
function identity(el){
 if(el.id)return `[id=${quote(el.id)}]`;
 const attributes=stable(el,['name']);
 return attributes?el.localName+attributes:'';
}
const position=(root,selector,el)=>{if(!selector)return -1;try{return [...root.querySelectorAll(selector)].indexOf(el)}catch{return -1}};
// 区域没有 id 时按标签、稳定属性和标题文字认出它；卡片增减后序号会错位，不能按序号找。
const title=el=>(el.querySelector?.('h1,h2,h3,summary')?.textContent||'').replace(/\s+/g,' ').trim();
function regionKey(region){
 if(region.id)return {region:`[id=${quote(region.id)}]`,title:''};
 const selector=region.localName+stable(region,['aria-label','aria-labelledby']),heading=title(region);
 return heading||selector!==region.localName?{region:selector,title:heading}:{region:'',title:''};
}

/** 重绘前调用：记下焦点控件在 #main 里的定位方式；焦点不在 #main 内时返回 null。 */
export function focusKey(el,root=el?.closest?.('#main')){
 if(!el||!root||el===root||typeof el.closest!=='function'||!root.contains?.(el))return null;
 const selector=identity(el),region=el.parentElement?.closest?.(REGION);
 const area=region&&region!==root&&root.contains(region)?regionKey(region):{region:'',title:''};
 return {root,selector,index:position(root,selector,el),...area};
}

/** 重绘后调用：焦点已经落回 body 时，依次尝试同一控件、它所在卡片的标题、#main 本身。 */
export function restoreFocus(key){
 if(!key?.root?.isConnected)return false;
 const doc=key.root.ownerDocument,active=doc.activeElement;
 if(active&&active!==doc.body&&active!==doc.documentElement&&active.isConnected)return false;
 const all=selector=>{if(!selector)return [];try{return [...key.root.querySelectorAll(selector)]}catch{return []}};
 // 同一身份的控件按原序号找，找不到时退回第一个。
 const controls=all(key.selector),control=controls[key.index]||controls[0]||null;
 // 区域按 id，或按标签、稳定属性加标题文字认；认不准就直接退回 #main，不跳到不相干的卡片。
 const regions=all(key.region).filter(el=>!key.title||title(el)===key.title);
 const region=regions.length===1||key.region.startsWith('[id=')?regions[0]:null,heading=region&&(region.querySelector('h1,h2,h3,summary')||region);
 for(const target of [control,heading,key.root]){
  if(!target||target.disabled)continue;
  // 标题本身不可聚焦：只为这次程序聚焦加 tabindex=-1，不进入 Tab 顺序。
  if(target===heading&&target.tabIndex<0&&!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');
  target.focus({preventScroll:true});
  if(doc.activeElement===target)return true;
 }
 return false;
}

const choice=field=>field.type==='checkbox'||field.type==='radio';
export function fieldEdited(field){
 if(choice(field))return field.checked!==field.defaultChecked;
 if(field.options)return [...field.options].some(option=>option.selected!==option.defaultSelected);
 return 'defaultValue' in field&&field.value!==field.defaultValue;
}
/** 表单里是否有用户改过、尚未保存的字段。原样离开的表单不必留作草稿。 */
export const formEdited=form=>[...(form?.elements||[])].some(fieldEdited);

/** 把草稿里没改过的字段换成最新渲染的值（另一个窗口可能已保存新设置），改过的字段保持原样。 */
export function refreshDraft(draft,latest){
 for(const field of draft?.elements||[]){
  const current=field.name&&latest?.elements?.namedItem?.(field.name);
  if(!current||fieldEdited(field))continue;
  if(choice(field))field.checked=field.defaultChecked=current.defaultChecked;
  else if(field.options)for(const option of field.options)option.selected=option.defaultSelected=[...current.options].some(item=>item.value===option.value&&item.defaultSelected);
  else if('defaultValue' in field)field.value=field.defaultValue=current.defaultValue;
 }
}

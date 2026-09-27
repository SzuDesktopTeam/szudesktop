// 页面用 innerHTML 拼模板，这里是全项目唯一的 HTML 转义：文本和用引号包住的属性值都靠它。
// null/undefined 输出空串。各模块统一从这里导入，别再抄一份本地副本，check-ui 会拦下。
const ENTITIES={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>ENTITIES[c]);

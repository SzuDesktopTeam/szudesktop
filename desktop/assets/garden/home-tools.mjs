import {esc} from './html.mjs';

// Destinations only: searching here never sends a keyword or personal data to school.
export const HOME_TOOLS=[
 {id:'library',title:'去图书馆找本书',note:'馆藏、位置与索书号',icon:'i-book',page:'services',tab:'library',keywords:'查书 图书 搜书 借阅 知网 万方 文献'},
 {id:'notices',title:'看看学校新消息',note:'按学院读公告、搜全文',icon:'i-mail',page:'services',tab:'notices',keywords:'公文通 通知 新闻 学院 公告'},
 {id:'timetable',title:'今天上什么课',note:'个人课表 · 学校登录',icon:'i-calendar',page:'study',tab:'timetable',keywords:'查课 课表 教务 本科 研究生'},
 {id:'spaces',title:'找个安静的地方',note:'自习空间与官方预约',icon:'i-sign',page:'services',tab:'spaces',keywords:'自习室 静音舱 预约 会议室 网络面试间'},
 {id:'electricity',title:'宿舍还剩多少电',note:'剩余电量 · 校内查询',icon:'i-lantern',page:'services',tab:'electricity',keywords:'宿舍 电量 电费 余额 用电'},
 {id:'sport',title:'课后去运动',note:'体育场馆与开放时段',icon:'i-medal',page:'services',tab:'sport',keywords:'体育 运动 预约 羽毛球 篮球 游泳'},
 {id:'notes',title:'写一页课堂笔记',note:'本机保存，离线也能写',icon:'i-quill',page:'study',tab:'notes',keywords:'课程 笔记 课堂 飞书 共学 markdown'},
 {id:'grades',title:'成绩与绩点',note:'官方查询、本机加权计算',icon:'i-scroll',page:'study',tab:'grades',keywords:'成绩 GPA 学分 绩点'},
 {id:'catalog',title:'全校班级课表',note:'按学期、班级查询 · 测试中',icon:'i-calendar',page:'study',tab:'catalog',keywords:'全校 课程 班级 排课 教务'},
 {id:'program',title:'培养方案',note:'已发布的模块与课程 · 测试中',icon:'i-scroll',page:'study',tab:'program',keywords:'培养方案 学业 学分 要求'},
 {id:'network',title:'连接校园网',note:'登录、连接状态与排障',icon:'i-crystal',page:'network',keywords:'网络 联网 断网 VPN 代理 路由器 认证'},
 {id:'focus',title:'专注一会儿',note:'待办小事与专注计时',icon:'i-clock',page:'study',tab:'focus',keywords:'专注 番茄钟 待办 计时 任务'},
 {id:'piano',title:'学院琴房',note:'专用账号 · 只读查询',icon:'i-key',page:'services',tab:'piano',keywords:'琴房 练琴 钢琴 预约'},
 {id:'directory',title:'学校常用入口',note:'邮箱、办事大厅与 WebVPN',icon:'i-compass',page:'services',tab:'directory',keywords:'邮箱 办事大厅 WebVPN AI云 电话'},
];

export function findHomeTools(query=''){
 const words=String(query).normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean);
 if(!words.length)return HOME_TOOLS.slice(0,6);
 return HOME_TOOLS.filter(tool=>{
  const text=[tool.title,tool.note,tool.keywords].join(' ').toLowerCase();
  return words.every(word=>text.includes(word));
 });
}

export function homeToolResults(query='',sprite=()=> ''){
 const tools=findHomeTools(query),searching=Boolean(String(query).trim());
 return `<p class="home-tools-count" role="status" aria-live="polite">${searching?tools.length?`找到 ${tools.length} 个功能`:'没有找到对应功能，试试「查书」「公告」或「电量」。':'常用的六件小事 · 选一项直接打开'}</p><div class="home-tool-grid">${tools.map(tool=>`<button type="button" class="home-tool" data-action="navigate" data-page="${tool.page}"${tool.tab?` data-tab="${tool.tab}"`:''}><span class="home-tool-icon" aria-hidden="true">${sprite(tool.icon)}</span><span class="home-tool-copy"><strong>${esc(tool.title)}</strong><small>${esc(tool.note)}</small></span><span class="home-tool-arrow" aria-hidden="true">↗</span></button>`).join('')}</div>`;
}

export function homeToolbox({query='',sprite=()=> ''}={}){
 return `<section class="home-campus-tools" aria-labelledby="home-tools-title"><div class="home-tools-heading"><div><p class="eyebrow">荔园便民路牌</p><h2 id="home-tools-title">校园里的事，少绕几步。</h2></div><div class="home-tools-search"><label for="home-tool-search">找功能</label><input type="search" id="home-tool-search" placeholder="查书、公告、电量、GPA…" value="${esc(query)}" maxlength="80" autocomplete="off" aria-controls="home-tool-results"></div></div><div id="home-tool-results">${homeToolResults(query,sprite)}</div></section>`;
}

// Keep real-account acceptance separate from offline implementation checks.
export const UNVERIFIED_TEXT='还没用真实账号验收过';
export const unverifiedBadge=()=>`<span class="badge" data-tone="warning" title="代码已完成，但没有用真实学校账号验收过；结果以学校系统为准">${UNVERIFIED_TEXT}</span>`;

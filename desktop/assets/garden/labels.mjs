// Keep real-account acceptance separate from offline implementation checks.
export const UNVERIFIED_TEXT='测试中';
export const unverifiedBadge=()=>`<span class="badge" data-tone="warning" title="尚未完成真实账号验证，请以学校系统结果为准" aria-label="测试中：尚未完成真实账号验证，请以学校系统结果为准">${UNVERIFIED_TEXT}</span>`;

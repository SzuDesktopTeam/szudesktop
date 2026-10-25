import assert from 'node:assert/strict';
import {isSafeExternalUrl} from './external-url.mjs';
import {feedbackMailto} from '../assets/garden/feedback.mjs';

for(const body of ['中文 & symbols # 100%\n第二行','说明'.repeat(2000)])assert.equal(isSafeExternalUrl(feedbackMailto(body,'beta99.0.0').url),true);
assert.equal(isSafeExternalUrl('mailto:alakazama@qq.com'),true);
for(const url of ['mailto:someone@example.com','mailto:alakazama@qq.com,other@example.com','mailto:alakazama@qq.com?bcc=other@example.com','mailto:alakazama@qq.com?cc=other@example.com','mailto:alakazama@qq.com?subject=a&subject=b','mailto:alakazama@qq.com?subject=hello%0d%0aBcc%3Ax','mailto:alakazama@qq.com#other','mailto:alakazama@qq.com?body='+('x'.repeat(1800)),'file:///C:/x','javascript:alert(1)','search-ms:query'])assert.equal(isSafeExternalUrl(url),false,url);
console.log('PASS feedback mailto only opens the fixed recipient with bounded subject/body; unrelated protocols and extra recipients rejected');

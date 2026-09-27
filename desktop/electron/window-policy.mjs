// The renderer only needs local HTTP assets and APIs. School pages open outside it.
export const contentSecurityPolicy = [
  "default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", "font-src 'self'", "connect-src 'self'",
  "base-uri 'none'", "object-src 'none'", "frame-src 'none'", "form-action 'self'",
].join('; ');

export function isAppUrl(url, baseUrl) {
  try {
    const target = new URL(url), base = new URL(baseUrl);
    return base.protocol === 'http:' && base.hostname === '127.0.0.1'
      && target.origin === base.origin && !target.username && !target.password;
  } catch { return false; }
}

export function isTrustedSender(event, mainWin, baseUrl) {
  return Boolean(mainWin && event.sender === mainWin.webContents
    && event.senderFrame === mainWin.webContents.mainFrame
    && isAppUrl(event.senderFrame?.url, baseUrl));
}

// loadURL 要等页面完全加载才 resolve；在此之前页面自己跳转、用户提交登录表单或再次打开
// 同一窗口，都会让它以 ERR_ABORTED（-3）结束。页面其实仍在正常导航，不能当成打开失败。
export function isNavigationAbort(error) {
  return error?.code === 'ERR_ABORTED' || error?.errno === -3;
}

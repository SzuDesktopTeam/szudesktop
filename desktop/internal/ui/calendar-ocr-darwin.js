// 校历 OCR（macOS）：calendar_darwin.go 经 /usr/bin/osascript -l JavaScript 从标准输入运行。
// 图片路径和缩放的最长边经环境变量传入（SZU_CALENDAR_IMAGE、SZU_CALENDAR_MAX_EDGE，0 为原图），
// 识别出的文字按从上到下、同一行从左到右逐行写到标准输出（UTF-8）。
//
// 失败只用固定的英文标记（SZU_OCR_*）报给 Go 端，与 Windows 的 calendar-ocr.ps1 同理：
// osascript 的报错正文会随系统语言变化，按原文归类靠不住。
ObjC.import('Foundation');
ObjC.import('AppKit');
ObjC.import('CoreGraphics');
ObjC.import('Vision');

function env(name) {
  var value = $.NSProcessInfo.processInfo.environment.objectForKey(name);
  return value.isNil() ? '' : ObjC.unwrap(value);
}

function fail() {
  throw new Error('SZU_OCR_FAILED');
}

// 同一张图，不同尺寸下 Vision 漏认的字不一样（实测「学期为」的「为」时有时无），
// 所以缩放到 Go 端指定的最长边再认；放大也做，由 Go 端决定试哪几种尺寸。
function scaled(image, edge) {
  var w = $.CGImageGetWidth(image), h = $.CGImageGetHeight(image);
  if (!(edge > 0) || Math.max(w, h) === edge) return image;
  var s = edge / Math.max(w, h);
  var nw = Math.max(1, Math.round(w * s)), nh = Math.max(1, Math.round(h * s));
  var ctx = $.CGBitmapContextCreate(null, nw, nh, 8, 0, $.CGColorSpaceCreateDeviceRGB(), $.kCGImageAlphaPremultipliedLast);
  if (!ctx) fail();
  $.CGContextSetInterpolationQuality(ctx, $.kCGInterpolationHigh);
  $.CGContextDrawImage(ctx, $.CGRectMake(0, 0, nw, nh), image);
  var out = $.CGBitmapContextCreateImage(ctx);
  if (!out) fail();
  return out;
}

function run() {
  var data = $.NSData.dataWithContentsOfFile(env('SZU_CALENDAR_IMAGE'));
  // 按像素取图：NSImage 按 DPI 换算的「点」尺寸会把高 DPI 的图悄悄缩小。
  var rep = data.isNil() ? null : $.NSBitmapImageRep.imageRepWithData(data);
  if (!rep || rep.isNil()) fail();
  var image = rep.CGImage;
  if (!image) fail();
  image = scaled(image, parseInt(env('SZU_CALENDAR_MAX_EDGE'), 10) || 0);

  var request = $.VNRecognizeTextRequest.alloc.init;
  request.recognitionLevel = $.VNRequestTextRecognitionLevelAccurate;
  // 没有简体中文识别时，英文模型会把校历读成拉丁乱码；如实报出来，不当成版式变化。
  var supported = ObjC.deepUnwrap(request.supportedRecognitionLanguagesAndReturnError(null)) || [];
  if (supported.indexOf('zh-Hans') < 0) throw new Error('SZU_OCR_LANGUAGE_UNAVAILABLE');
  request.recognitionLanguages = $(['zh-Hans', 'en-US']);
  request.usesLanguageCorrection = true;
  var handler = $.VNImageRequestHandler.alloc.initWithCGImageOptions(image, $.NSDictionary.dictionary);
  if (!handler.performRequestsError($([request]), null)) fail();

  var items = [];
  var results = request.results;
  for (var i = 0; i < results.count; i++) {
    var observation = results.objectAtIndex(i);
    var candidates = observation.topCandidates(1);
    if (candidates.count === 0) continue;
    var box = observation.boundingBox;
    items.push({text: ObjC.unwrap(candidates.objectAtIndex(0).string), x: box.origin.x, bottom: box.origin.y, top: box.origin.y + box.size.height});
  }
  // Vision 的坐标原点在左下角。同一行被拆成几段时（「开始上课：」「9月28日」），
  // 纵向中点落在该行范围内的归为一行，行内从左到右拼接，日期才能和前面的字连上。
  items.sort(function (a, b) { return b.top - a.top || a.x - b.x; });
  var lines = [];
  items.forEach(function (item) {
    var line = lines[lines.length - 1];
    var middle = (item.top + item.bottom) / 2;
    if (line && middle >= line.bottom && middle <= line.top) {
      line.items.push(item);
    } else {
      lines.push({top: item.top, bottom: item.bottom, items: [item]});
    }
  });
  var text = lines.map(function (line) {
    return line.items.sort(function (a, b) { return a.x - b.x; }).map(function (item) { return item.text; }).join(' ');
  }).join('\n');
  $.NSFileHandle.fileHandleWithStandardOutput.writeData($(text + '\n').dataUsingEncoding($.NSUTF8StringEncoding));
}

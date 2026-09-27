"""Run the actual GUI executable with an isolated config and no real authentication."""
import http.client, json, os, re, socket, struct, subprocess, sys, tempfile, threading, time
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
EXE=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'dist/szudesktop-windows-amd64.exe'
for stream in (sys.stdout,sys.stderr):
    if hasattr(stream,'reconfigure'): stream.reconfigure(encoding='utf-8',errors='replace')
if len(sys.argv)>2: port=int(sys.argv[2])
else:
    with socket.socket() as sock: sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
BASE=f'http://127.0.0.1:{port}'
# 本次运行的调用方凭据：引擎在标准输出的协议行里交出来（server.go 的 announce），
# 除 /api/health 与 /api/instance 外每个接口都要带 X-SZU-Token。
TOKEN=None
ENDPOINT_LINE=re.compile(r'szuDesktop (已启动|已复用): (http://127\.0\.0\.1:\d+)\r?')
SESSION_LINE=re.compile(r'szuDesktop 会话: ([0-9a-f]{64})\r?')
class Announcement:
    """Parse the engine's stdout protocol lines (the GUI exe has no console)."""
    def __init__(self,proc):
        self.url=self.token=self.verb=None
        self.ready=threading.Event()
        # Keep draining after both lines arrive so the pipe can never fill and block Go.
        threading.Thread(target=self._read,args=(proc.stdout,),daemon=True).start()
    def _read(self,stream):
        for raw in stream:
            line=raw.decode('utf-8','replace').rstrip('\n')
            endpoint,session=ENDPOINT_LINE.fullmatch(line),SESSION_LINE.fullmatch(line)
            if endpoint and not self.url: self.verb,self.url=endpoint.group(1),endpoint.group(2)
            if session and not self.token: self.token=session.group(1)
            if self.url and self.token: self.ready.set()
    def wait(self,timeout=15):
        if not self.ready.wait(timeout): raise RuntimeError('engine did not announce its address and session token')
        return self
# Use a direct local HTTP connection: no system proxy and no premature
# Connection: close while the server is rejecting an unread request body.
def request(path,data=None,method=None,headers=None,auth=True):
    h={'Content-Type':'application/json'} if data is not None else {}
    if auth and TOKEN: h['X-SZU-Token']=TOKEN
    h.update(headers or {})
    body=json.dumps(data).encode() if data is not None else None
    conn=http.client.HTTPConnection('127.0.0.1',port,timeout=45)
    try:
        conn.request(method or ('POST' if data is not None else 'GET'),path,body,headers=h)
        response=conn.getresponse()
        return response.status,response.read(),response.headers
    finally:
        conn.close()

def get(path):
    code,body,_=request(path);assert code==200,(path,code,body);return json.loads(body)
def check(name,ok):
    assert ok,name
    print('PASS',name)
raw=EXE.read_bytes();pe=struct.unpack_from('<I',raw,0x3c)[0]
check('Windows GUI subsystem: no console',struct.unpack_from('<H',raw,pe+24+68)[0]==2)
# 版本号只有一个来源；exe 自报的必须和它一致，否则发布包会写错版本。
VERSION=(ROOT/'internal/version/VERSION').read_text(encoding='utf-8').strip()
# 不用 text=True：exe 输出 UTF-8，而 Windows 控制台默认 GBK，会让 stdout 变成 None。
version_out=subprocess.run([str(EXE),'--version'],capture_output=True,timeout=60)
check('exe reports the version from internal/version/VERSION',VERSION in version_out.stdout.decode('utf-8','replace'))
# 资源管理器「详细信息」、任务管理器和防火墙弹窗读的是版本资源。用系统自己的 API 读：
# 以前资源结构写错，这些字段全空、图标也是默认的，而 add_resource 的校验照样通过。
import ctypes
from ctypes import wintypes
def file_version_info(path):
    api=ctypes.WinDLL('version')
    api.GetFileVersionInfoSizeW.argtypes=[wintypes.LPCWSTR,ctypes.c_void_p]
    api.GetFileVersionInfoW.argtypes=[wintypes.LPCWSTR,wintypes.DWORD,wintypes.DWORD,ctypes.c_void_p]
    api.VerQueryValueW.argtypes=[ctypes.c_void_p,wintypes.LPCWSTR,ctypes.POINTER(ctypes.c_void_p),ctypes.POINTER(wintypes.UINT)]
    size=api.GetFileVersionInfoSizeW(str(path),None)
    if not size: return None,{}
    buf=ctypes.create_string_buffer(size)
    if not api.GetFileVersionInfoW(str(path),0,size,buf): return None,{}
    def query(sub):
        ptr,n=ctypes.c_void_p(),wintypes.UINT()
        return (ptr,n.value) if api.VerQueryValueW(buf,sub,ctypes.byref(ptr),ctypes.byref(n)) and n.value else (None,0)
    ptr,n=query('\\')
    fixed=struct.unpack('<13I',ctypes.string_at(ptr,52)) if ptr and n>=52 else None
    ptr,n=query('\\VarFileInfo\\Translation')
    lang,codepage=struct.unpack('<HH',ctypes.string_at(ptr,4)) if ptr and n>=4 else (0x409,1200)
    strings={}
    for key in ('FileVersion','ProductVersion','FileDescription','ProductName','CompanyName'):
        ptr,_=query('\\StringFileInfo\\%04X%04X\\%s'%(lang,codepage,key))
        strings[key]=ctypes.wstring_at(ptr) if ptr else ''
    return fixed,strings
fixed,strings=file_version_info(EXE)
numbers=tuple(([int(x) for x in re.findall(r'\d+',VERSION)]+[0,0,0,0])[:4])
check('exe version resource readable by Windows',fixed is not None and fixed[0]==0xFEEF04BD)
check('exe file version resource matches VERSION',strings.get('FileVersion')==VERSION and strings.get('ProductVersion')==VERSION
      and (fixed[2]>>16,fixed[2]&0xFFFF,fixed[3]>>16,fixed[3]&0xFFFF)==numbers)
check('exe description, product and company names readable',all(strings.get(k) for k in ('FileDescription','ProductName','CompanyName')))
shell32=ctypes.WinDLL('shell32');shell32.ExtractIconExW.argtypes=[wintypes.LPCWSTR,ctypes.c_int,ctypes.c_void_p,ctypes.c_void_p,wintypes.UINT]
check('exe carries its own icon',shell32.ExtractIconExW(str(EXE),-1,None,None,0)>=1)
with tempfile.TemporaryDirectory(prefix='szudesktop-smoke-') as cfg:
    proc=subprocess.Popen([str(EXE),'--no-open','--no-auto-login','--addr',f'127.0.0.1:{port}'],env=dict(os.environ,SZUNET_CONFIG_DIR=cfg),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    try:
        announced=Announcement(proc).wait()
        check('engine announces its address and a session token',announced.verb=='已启动' and announced.url==BASE)
        TOKEN=announced.token
        for _ in range(40):
            if proc.poll() is not None: raise RuntimeError('test process exited')
            try:
                if request('/api/workspace')[0]==200: break
            except OSError: pass
            time.sleep(.25)
        else: raise RuntimeError('server did not start')
        check('test process is alive',proc.poll() is None)
        duplicate=subprocess.Popen([str(EXE),'--no-open','--no-auto-login'],env=dict(os.environ,SZUNET_CONFIG_DIR=cfg),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
        try:
            out,_=duplicate.communicate(timeout=10)
            check('duplicate launch reuses instance',duplicate.returncode==0 and proc.poll() is None)
            check('duplicate launch hands over the same address and token',out.decode('utf-8','replace').splitlines()
                  ==[f'szuDesktop 已复用: {BASE}',f'szuDesktop 会话: {TOKEN}'])
        finally:
            if duplicate.poll() is None: duplicate.kill();duplicate.wait()
        check('instance rejects wrong token',request('/api/instance',{'token':'wrong','open':False},auth=False)[0]==403)
        # 127.0.0.1 不按 Windows 用户隔离：不带凭据的本机调用方一律 401，拒绝信息里不带凭据。
        code,body,_=request('/api/status',auth=False)
        check('API rejects callers without the session token',code==401 and TOKEN.encode() not in body and json.loads(body)['ok'] is False)
        check('API rejects a wrong session token',request('/api/credential',headers={'X-SZU-Token':'0'*64})[0]==401)
        check('API rejects the token in a query string',request('/api/status?launch='+TOKEN,auth=False)[0]==401)
        check('health needs no session token',request('/api/health',auth=False)[0]==200)
        code,_,headers=request('/?launch='+TOKEN,auth=False)
        cookie=headers.get('Set-Cookie') or ''
        check('launch URL trades the token for a session cookie',code==303 and headers.get('Location')=='/'
              and cookie.startswith(f'szu_session={TOKEN};') and all(part in cookie for part in ('Path=/','HttpOnly','SameSite=Strict')))
        check('session cookie authorizes the page',request('/api/status',auth=False,headers={'Cookie':f'szu_session={TOKEN}'})[0]==200)
        code,_,headers=request('/?launch='+'0'*64,auth=False)
        check('wrong launch token gets no cookie',code==200 and headers.get('Set-Cookie') is None)
        check('cross-origin request rejected even with the token',request('/api/credential',headers={'Origin':'https://example.com'})[0]==403)
        check('window API rejects cross origin',request('/api/window',{'id':'smoke-window-primary'},headers={'Origin':'https://example.com'})[0]==403)
        check('window heartbeat accepted',request('/api/window',{'id':'smoke-window-primary'})[0]==200)
        check('second window heartbeat accepted',request('/api/window',{'id':'smoke-window-second'})[0]==200)
        check('second window close accepted',request('/api/window',{'id':'smoke-window-second','closing':True})[0]==200)
        for name in ['/api/status','/api/diag','/api/credential','/api/vpn/status','/api/campus/status']:
            check(name,isinstance(get(name),dict))
        check('notice source is allowlisted',request('/api/campus/notices?source=https://example.com')[0]==400)
        check('notices reject cross origin',request('/api/campus/notices?source=undergrad',headers={'Origin':'https://example.com'})[0]==403)
        check('notices reject POST',request('/api/campus/notices?source=undergrad',{})[0]==405)
        check('bundled official calendar available offline',get('/api/campus/calendar')['terms'][0]['week_start']=='2026-08-30')
        check('calendar rejects cross origin',request('/api/campus/calendar',headers={'Origin':'https://example.com'})[0]==403)
        check('calendar rejects POST',request('/api/campus/calendar',{})[0]==405)
        check('academic login starts signed out',get('/api/academic/session')['authenticated'] is False)
        check('timetable requires academic login',request('/api/academic/timetable')[0]==409)
        check('academic login rejects cross origin',request('/api/academic/login',{},headers={'Origin':'https://example.com'})[0]==403)
        check('academic login requires complete fields',request('/api/academic/login',{})[0]==400)
        check('default VPN unavailable',get('/api/vpn/status')['state']=='unavailable')
        check('no account exposed in status',get('/api/status')['username']=='')
        check('status reports the same version as the exe',get('/api/status')['app_version']==VERSION)
        check('page carries no hardcoded version string',b'beta0' not in request('/')[1] and b'beta0' not in request('/assets/garden/app.mjs')[1])
        # 只读状态和拒绝路径：冒烟测试绝不 POST 打开/关掉开关，那会真的改掉这台机器的启动项。
        autostart=get('/api/autostart')
        check('autostart status readable',isinstance(autostart,dict) and 'detail' in autostart and 'supported' in autostart)
        check('autostart never reports unknown state as disabled',not autostart.get('error') or '未开启'!=autostart.get('detail'))
        check('autostart rejects cross origin',request('/api/autostart',{'enabled':True},headers={'Origin':'https://example.com'})[0]==403)
        check('autostart rejects PUT',request('/api/autostart',method='PUT')[0]==405)
        check('autostart rejects malformed body',request('/api/autostart',{},headers={'Content-Type':'application/json'})[0]==400)
        for path,file in [('/',ROOT/'desktop/index.html'),('/assets/garden/app.mjs',ROOT/'desktop/assets/garden/app.mjs'),('/assets/garden/style.css',ROOT/'desktop/assets/garden/style.css'),('/assets/garden/engine.mjs',ROOT/'desktop/assets/garden/engine.mjs'),('/assets/garden/campus.mjs',ROOT/'desktop/assets/garden/campus.mjs'),('/assets/garden/campus-ui.mjs',ROOT/'desktop/assets/garden/campus-ui.mjs'),('/assets/garden/academic.mjs',ROOT/'desktop/assets/garden/academic.mjs'),('/assets/garden/school.mjs',ROOT/'desktop/assets/garden/school.mjs'),('/assets/garden/network-status.mjs',ROOT/'desktop/assets/garden/network-status.mjs'),('/assets/garden/campus.png',ROOT/'desktop/assets/garden/campus.png'),('/assets/szudesktop.ico',ROOT/'desktop/assets/szudesktop.ico')]:
            code,body,_=request(path);check('embedded '+path,code==200 and body==file.read_bytes())
        code,css,_=request('/assets/fonts/fusion-pixel.css')
        check('pixel font stylesheet packaged',code==200)
        font_paths=re.findall(r'url\(([^)]+\.woff2)\)',css.decode('utf-8'))
        check('pixel font subsets complete',len(font_paths)>0 and all(request('/assets/fonts/'+name)[0]==200 for name in font_paths))
        check('OFL license packaged',b'SIL OPEN FONT LICENSE' in request('/assets/fonts/LICENSE-OFL.txt')[1])
        # 只探测页面实际引用的 flora 素材（首页窗边小花、未开垦地块等），没人引用的装饰图可以删，
        # 不必为冒烟留着。一个都没引用时就不再检查这一项。
        flora=sorted({name for source in [ROOT/'desktop/index.html',*(ROOT/'desktop/assets/garden').glob('*.css'),*(ROOT/'desktop/assets/garden').glob('*.mjs')]
                      for name in re.findall(r'flora/([\w-]+\.png)',source.read_text(encoding='utf-8'))})
        if flora: check('referenced flora embedded: '+', '.join(flora),all(request('/assets/garden/flora/'+name)[1]==(ROOT/'desktop/assets/garden/flora'/name).read_bytes() for name in flora))
        check('legacy borrowed art not packaged',request('/assets/art/m1.png')[0]==404)
        check('old game font not packaged',request('/assets/fonts/svbold.ttf')[0]==404)
        credential={'username':'000000','password':'smoke-test-only-not-real'}
        check('save isolated test credential',request('/api/credential',credential)[0]==200)
        check('saved username remains hidden',get('/api/credential')['username']=='')
        check('explicit username reveal',get('/api/credential?reveal=1')['username']=='000000')
        check('credential never returns password','password' not in get('/api/credential?reveal=1'))
        check('delete isolated credential',request('/api/credential',method='DELETE')[0]==200)
        check('no school session by default',get('/api/session')['saved'] is False)
        check('graduate session check needs saved session',request('/api/session/check?level=graduate',{})[0]==409)
        check('session probe validates level',request('/api/session/check?level=invalid',{})[0]==400)
        check('session rejects cross-origin write',request('/api/session',{'cookie':'test-only=1'},headers={'Origin':'https://example.com'})[0]==403)
        fake_session='session-smoke-only=not-a-real-cookie'
        check('save isolated school session',request('/api/session',{'cookie':fake_session})[0]==200)
        session_status=get('/api/session')
        check('school session never echoed',session_status['saved'] and fake_session not in json.dumps(session_status) and 'cookie' not in session_status)
        session_file=Path(cfg)/'session.json'
        check('school session encrypted on disk',session_file.exists() and fake_session.encode() not in session_file.read_bytes())
        check('delete isolated school session',request('/api/session',method='DELETE')[0]==200 and not session_file.exists())

        code,body,_=request('/api/login',{'username':'','password':''});check('empty login explains failure',code==200 and not json.loads(body)['ok'])
        w=get('/api/workspace');check('initial workspace empty',w['data'] is None)
        snapshot={'version':1,'revision':0,'data':{'test':'restart'}}
        check('workspace write',request('/api/workspace',snapshot)[0]==200)
        check('stale workspace rejected',request('/api/workspace',snapshot)[0]==409)
        check('cross-origin mutation rejected',request('/api/workspace',snapshot,headers={'Origin':'https://example.com'})[0]==403)
        check('shutdown requires POST',request('/api/shutdown')[0]==405)
        check('application exit endpoint',request('/api/shutdown',{})[0]==200)
        proc.wait(timeout=6);check('clean shutdown',proc.returncode==0)
        # A new random port must see the same file-backed save.
        with socket.socket() as sock: sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        BASE=f'http://127.0.0.1:{port}'
        previous=TOKEN
        proc=subprocess.Popen([str(EXE),'--no-open','--no-auto-login','--addr',f'127.0.0.1:{port}'],env=dict(os.environ,SZUNET_CONFIG_DIR=cfg),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
        TOKEN=Announcement(proc).wait().token
        check('every run gets a fresh session token',TOKEN!=previous)
        check('previous run token no longer works',request('/api/workspace',headers={'X-SZU-Token':previous})[0]==401)
        for _ in range(40):
            try:
                w=get('/api/workspace');break
            except OSError: time.sleep(.25)
        else: raise RuntimeError('restart failed')
        check('save survives process and port change',w['revision']==1 and w['data']=={'test':'restart'})
        stream_conn=http.client.HTTPConnection('127.0.0.1',port,timeout=5)
        stream_conn.request('GET','/api/window-stream?id=smoke-window-stream',headers={'X-SZU-Token':TOKEN})
        stream=stream_conn.getresponse()
        check('window stream connected',stream.status==200 and stream.readline()==b': alive\n')
        stream.close();stream_conn.close()
        proc.wait(timeout=16)
        check('closing last window exits the process',proc.returncode==0)
    finally:
        if proc.poll() is None:
            proc.terminate()
            try: proc.wait(timeout=5)
            except subprocess.TimeoutExpired: proc.kill();proc.wait(timeout=5)
print('ALL SMOKE CHECKS PASSED')

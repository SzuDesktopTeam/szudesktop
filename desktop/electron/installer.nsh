; electron-builder.yml 的 nsis.include 引用本文件（makensis 以 -INPUTCHARSET UTF8 读取）。
;
; 开机自启由 main.mjs 通过 app.setLoginItemSettings() 登记：值写在
; HKCU\Software\Microsoft\Windows\CurrentVersion\Run，值名是 AppUserModelId
; （main.mjs 里 setAppUserModelId 设成与 appId 相同的 com.szudesktop.app）；
; 用户在任务管理器里停用时，Windows 另在 Explorer\StartupApproved\Run 记同名值。
; electron-builder 的卸载模板不清理这两处，卸载后会留下指向已删除程序的失效启动项。
; 升级时旧版卸载程序以 --updated 运行（isUpdated），此时保留用户的自启选择。
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${APP_ID}"
  ${endIf}
!macroend

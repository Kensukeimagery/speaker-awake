; Remove the "start with Windows" entry written by app.setLoginItemSettings on uninstall.
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.Speaker Awake"
!macroend

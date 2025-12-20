!macro customHeader
  ; Custom header styling removed to fix build error
!macroend

!macro customInit
  ; 1. Force kill the running application to release file locks
  nsExec::Exec 'taskkill /F /IM "MurCHAT.exe"'
  Sleep 1000

  ; 2. Check for the uninstaller in the default installation directory
  IfFileExists "$LOCALAPPDATA\Programs\murchat\Uninstall MurCHAT.exe" 0 +3
    nsExec::Exec '"$LOCALAPPDATA\Programs\murchat\Uninstall MurCHAT.exe" /S'
    Sleep 2000
!macroend

; This will be executed when the UI is created
!macro customPageCallbacks
  ; We can try to skin the window here if needed using specific NSIS plugins, 
  ; but for now let's stick to standard modern UI with custom bitmaps.
!macroend
!macro customHeader
  ; Custom header
!macroend

!macro customInit
  ; 1. Принудительно убиваем процессы, чтобы деинсталлятор не споткнулся
  nsExec::Exec 'taskkill /F /IM "MurCHAT.exe" /T'
  nsExec::Exec 'taskkill /F /IM "murchat.exe" /T'
  ; Используем $$ для экранирования переменной PowerShell в NSIS
  nsExec::Exec 'powershell.exe -WindowStyle Hidden -Command "Get-Process | Where-Object { $$_.Name -like \"*murchat*\" } | Stop-Process -Force -ErrorAction SilentlyContinue"'
  Sleep 1000

  ; 2. Ищем деинсталлятор и запускаем его перед установкой
  IfFileExists "$PROGRAMFILES64\MurCHAT\Uninstall MurCHAT.exe" found_uninstaller
  IfFileExists "$LOCALAPPDATA\Programs\murchat\Uninstall MurCHAT.exe" found_uninstaller_local
  Goto skip_uninstaller

found_uninstaller:
  ExecWait '"$PROGRAMFILES64\MurCHAT\Uninstall MurCHAT.exe" /S _?=$PROGRAMFILES64\MurCHAT'
  Goto skip_uninstaller

found_uninstaller_local:
  ExecWait '"$LOCALAPPDATA\Programs\murchat\Uninstall MurCHAT.exe" /S _?=$LOCALAPPDATA\Programs\murchat'
  Goto skip_uninstaller

skip_uninstaller:
  Sleep 1000
!macroend

!macro preInstall
  ; Финальная проверка перед копированием файлов
  nsExec::Exec 'taskkill /F /IM "MurCHAT.exe" /T'
  nsExec::Exec 'taskkill /F /IM "murchat.exe" /T'
  nsExec::Exec 'powershell.exe -WindowStyle Hidden -Command "Get-Process | Where-Object { $$_.Name -like \"*murchat*\" } | Stop-Process -Force -ErrorAction SilentlyContinue"'
  Sleep 1000
!macroend
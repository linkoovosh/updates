!macro customHeader
!macroend

!macro customInit
  ; Убиваем всё, что точно является нашим процессом
  nsExec::Exec 'taskkill /F /IM "MurCHAT.exe" /T'
  nsExec::Exec 'taskkill /F /IM "murchat.exe" /T'
  
  ; Даем системе выдохнуть
  Sleep 1000
!macroend

!macro preInstall
  ; Повторяем прямо перед записью файлов
  nsExec::Exec 'taskkill /F /IM "MurCHAT.exe" /T'
  nsExec::Exec 'taskkill /F /IM "murchat.exe" /T'
  Sleep 500
!macroend
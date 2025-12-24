!macro customHeader
  ; Custom header logic
!macroend

!macro customInit
  ; Просто пытаемся закрыть приложение, если оно открыто
  nsExec::Exec 'taskkill /F /IM "MurCHAT.exe" /T'
  nsExec::Exec 'taskkill /F /IM "murchat.exe" /T'
  Sleep 1000
!macroend

!macro preInstall
  ; Финальная попытка закрытия перед копированием
  nsExec::Exec 'taskkill /F /IM "MurCHAT.exe" /T'
  nsExec::Exec 'taskkill /F /IM "murchat.exe" /T'
!macroend

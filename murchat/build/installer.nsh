!macro customHeader
  ; Custom header logic
!macroend

!macro customInit
  ; Clear potential blockages before UI shows
  nsExec::Exec 'taskkill /F /IM "MurCHAT.exe" /T'
  nsExec::Exec 'taskkill /F /IM "murchat.exe" /T'
  Sleep 500
!macroend

!macro preInstall
  ; This runs right before files are copied. Crucial to kill it HERE again.
  DetailPrint "Завершение работы MurCHAT..."
  nsExec::Exec 'taskkill /F /IM "MurCHAT.exe" /T'
  nsExec::Exec 'taskkill /F /IM "murchat.exe" /T'
  
  ; Wait a bit for processes to actually die
  Sleep 1500
  
  ; Delete old exe if possible to verify lock is gone
  Delete "$INSTDIR\MurCHAT.exe"
  Delete "$INSTDIR\murchat.exe"
!macroend

!macro customInstall
  ; Logic after files are installed
!macroend

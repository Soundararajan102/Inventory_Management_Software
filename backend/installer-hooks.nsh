; ==============================================================================
; Electro Hub - NSIS Custom Lifecycle Hooks
; Automatically terminates any running instances to prevent file-lock / permission aborts
; ==============================================================================

!macro NSIS_HOOK_PREINSTALL
    DetailPrint "Terminating any running Electro Hub processes before upgrade..."
    nsExec::Exec 'taskkill /F /IM "app.exe" /T'
    nsExec::Exec 'taskkill /F /IM "Electro Hub.exe" /T'
    nsExec::Exec 'taskkill /F /IM "uninstall.exe" /T'
    nsExec::Exec 'taskkill /F /IM "Au_.exe" /T'
    Sleep 1000
!macroend

!macro NSIS_HOOK_PREUNINSTALL
    DetailPrint "Terminating any running Electro Hub processes before uninstall..."
    nsExec::Exec 'taskkill /F /IM "app.exe" /T'
    nsExec::Exec 'taskkill /F /IM "Electro Hub.exe" /T'
    nsExec::Exec 'taskkill /F /IM "uninstall.exe" /T'
    nsExec::Exec 'taskkill /F /IM "Au_.exe" /T'
    Sleep 1000
!macroend

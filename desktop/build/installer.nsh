; 升级/重装时预填上次安装目录（electron-builder assisted NSIS）
; 变量 INSTALL_REGISTRY_KEY 由 electron-builder 注入

!macro customInit
  Push $0
  StrCpy $0 ""

  SetRegView 64
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $0 == ""
    ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${EndIf}

  ${If} $0 == ""
    SetRegView 32
    ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $0 == ""
      ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${EndIf}
  ${EndIf}

  ${If} $0 != ""
    ${If} ${FileExists} "$0\*.*"
      StrCpy $INSTDIR "$0"
    ${ElseIf} ${FileExists} "$0"
      StrCpy $INSTDIR "$0"
    ${EndIf}
  ${EndIf}

  Pop $0
!macroend

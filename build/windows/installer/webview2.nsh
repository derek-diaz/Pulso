# Copy the complete Fixed Version runtime into Pulso's own directory.
# No shared runtime detection, downloads, or secondary installers.
!include "resources\webview2-fixed\version.nsh"

Function pulso.copyWebView2
    SetOutPath "$INSTDIR\WebView2\${PULSO_WEBVIEW2_VERSION}"
    !ifdef SUPPORTS_AMD64
        ${If} ${IsNativeAMD64}
            File /r "resources\webview2-fixed\amd64\Microsoft.WebView2.FixedVersionRuntime.${PULSO_WEBVIEW2_VERSION}.x64\*"
        ${EndIf}
    !endif
    !ifdef SUPPORTS_ARM64
        ${If} ${IsNativeARM64}
            File /r "resources\webview2-fixed\arm64\Microsoft.WebView2.FixedVersionRuntime.${PULSO_WEBVIEW2_VERSION}.arm64\*"
        ${EndIf}
    !endif

    # Microsoft's Fixed Version runtime requires these read/execute permissions
    # for its sandbox on Windows 10 (v120+). No global runtime is registered.
    # https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution#the-fixed-version-runtime-distribution-mode
    nsExec::ExecToStack '"$SYSDIR\icacls.exe" "$INSTDIR\WebView2\${PULSO_WEBVIEW2_VERSION}" /grant "*S-1-15-2-2:(OI)(CI)(RX)" "*S-1-15-2-1:(OI)(CI)(RX)"'
    Pop $0
    Pop $1
    StrCmp $0 "0" done
    DetailPrint "Could not set permissions on Pulso browser files: $1"
    IfSilent +2
        MessageBox MB_OK|MB_ICONSTOP "Setup could not configure Pulso's browser files. Please run the Pulso installer again."
    SetErrorLevel 1
    Abort
    done:
FunctionEnd

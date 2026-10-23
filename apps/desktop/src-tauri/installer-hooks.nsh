; Registration is per user and refreshed by the app on first launch.
!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\com.crowdash.host"
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\com.crowdash.host"
  DeleteRegKey HKCU "Software\Chromium\NativeMessagingHosts\com.crowdash.host"
  Delete "$APPDATA\Crowdash\native-messaging\com.crowdash.host.json"
  Delete "$APPDATA\Crowdash\native-messaging\endpoint.json"
!macroend

function startup(data, reason) {
  /// <summary>
  /// Bootstrap data structure @see https://developer.mozilla.org/en-US/docs/Extensions/Bootstrapped_extensions#Bootstrap_data
  /// &#10;  string id
  /// &#10;  string version
  /// &#10;  nsIFile installPath
  /// &#10;  nsIURI resourceURI
  /// &#10;
  /// Reason types:
  /// &#10;  APP_STARTUP
  /// &#10;  ADDON_ENABLE
  /// &#10;  ADDON_INSTALL
  /// &#10;  ADDON_UPGRADE
  /// &#10;  ADDON_DOWNGRADE
  /// </summary>
  console.info("xxx");
}
function shutdown(data, reason) {
  /// <summary>
  /// Bootstrap data structure @see https://developer.mozilla.org/en-US/docs/Extensions/Bootstrapped_extensions#Bootstrap_data
  /// &#10;  string id
  /// &#10;  string version
  /// &#10;  nsIFile installPath
  /// &#10;  nsIURI resourceURI
  /// &#10;
  /// Reason types:
  /// &#10;  APP_SHUTDOWN
  /// &#10;  ADDON_DISABLE
  /// &#10;  ADDON_UNINSTALL
  /// &#10;  ADDON_UPGRADE
  /// &#10;  ADDON_DOWNGRADE
  /// </summary>
}
function install(data, reason) {
  /// <summary>
  /// Bootstrap data structure @see https://developer.mozilla.org/en-US/docs/Extensions/Bootstrapped_extensions#Bootstrap_data
  /// &#10;  string id
  /// &#10;  string version
  /// &#10;  nsIFile installPath
  /// &#10;  nsIURI resourceURI
  /// &#10;
  /// Reason types:
  /// &#10;  ADDON_INSTALL
  /// &#10;  ADDON_UPGRADE
  /// &#10;  ADDON_DOWNGRADE
  /// </summary>
}
function uninstall(data, reason) {
  /// <summary>
  /// Bootstrap data structure @see https://developer.mozilla.org/en-US/docs/Extensions/Bootstrapped_extensions#Bootstrap_data
  /// &#10;  string id
  /// &#10;  string version
  /// &#10;  nsIFile installPath
  /// &#10;  nsIURI resourceURI
  /// &#10;
  /// Reason types:
  /// &#10;  ADDON_UNINSTALL
  /// &#10;  ADDON_UPGRADE
  /// &#10;  ADDON_DOWNGRADE
  /// </summary>
}
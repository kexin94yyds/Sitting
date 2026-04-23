const { systemPreferences } = require('electron');

function getAccessibilityStatus() {
  if (process.platform !== 'darwin') {
    return 'unsupported';
  }

  return systemPreferences.isTrustedAccessibilityClient(false) ? 'authorized' : 'denied';
}

function requestAccessibilityPermission() {
  if (process.platform !== 'darwin') {
    return 'unsupported';
  }

  return systemPreferences.isTrustedAccessibilityClient(true) ? 'authorized' : 'denied';
}

module.exports = {
  getAccessibilityStatus,
  requestAccessibilityPermission
};

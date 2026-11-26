const path = require('node:path');

const knownDiagnostics = [
  [/EADDRINUSE/iu, 'port_in_use'],
  [/EACCES|EPERM/iu, 'filesystem_permission'],
  [/MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/iu, 'missing_module'],
  [/ENOENT/iu, 'missing_runtime_file'],
  [/ENOSPC/iu, 'disk_full'],
  [/ERR_UNKNOWN_BUILTIN_MODULE|node:sqlite/iu, 'sqlite_runtime_unavailable'],
  [/could not find a production build/iu, 'next_build_missing'],
  [/ERR_INVALID_IP_ADDRESS/iu, 'invalid_network_address']
];

function classifyDiagnosticText(value) {
  const text = typeof value === 'string' ? value : '';
  const missingModule = text.match(/Cannot find module ['"]([^'"]+)['"]/iu)?.[1];
  if (missingModule) {
    if (/^(?:[a-z0-9_.-]+|@[a-z0-9_.-]+\/[a-z0-9_.-]+)(?:\/[^\\\s]+)*$/iu.test(missingModule)) {
      const topLevelPackage = missingModule.startsWith('@') ? missingModule.split('/').slice(0, 2).join('_') : missingModule.split('/')[0];
      return `missing_${topLevelPackage.replace(/[^a-z0-9_-]/giu, '_').toLowerCase()}`;
    }
    return 'missing_runtime_file';
  }
  return knownDiagnostics.find(([pattern]) => pattern.test(text))?.[1] || 'unclassified';
}

function formatStartupEntry(stage, code = 'none') {
  const safeStage = /^[a-z0-9-]{1,48}$/u.test(stage) ? stage : 'unknown-stage';
  const safeCode = /^[a-z0-9_-]{1,48}$/u.test(code) ? code : 'unknown-code';
  return `${new Date().toISOString()} stage=${safeStage} code=${safeCode}\n`;
}

function getPackagedNodePath(isPackaged, resourcesPath) {
  return isPackaged ? path.join(resourcesPath, 'next-server', 'server-dependencies') : undefined;
}

module.exports = { classifyDiagnosticText, formatStartupEntry, getPackagedNodePath };

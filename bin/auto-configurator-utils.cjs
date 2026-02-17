const yaml = require('js-yaml');

function objectToYaml(obj) {
  try {
    return yaml.dump(obj, { noRefs: true, sortKeys: false });
  } catch {
    return JSON.stringify(obj, null, 2) + '\n';
  }
}

function processTemplate(template, packagePath) {
  const processed = JSON.parse(JSON.stringify(template));

  const processObject = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = obj[key].replace('{{packagePath}}', packagePath);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        processObject(obj[key]);
      } else if (Array.isArray(obj[key])) {
        obj[key] = obj[key].map(item =>
          typeof item === 'string' ? item.replace('{{packagePath}}', packagePath) : item
        );
      }
    }
  };

  processObject(processed);
  return processed;
}

function toTomlValue(value) {
  if (Array.isArray(value)) {
    const items = value.map(item => toTomlValue(item)).join(', ');
    return `[${items}]`;
  }
  if (typeof value === 'string') {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null || value === undefined) {
    return '""';
  }
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function renderTomlTable(tableKey, entries) {
  const lines = [`[${tableKey}]`];
  for (const key of Object.keys(entries)) {
    lines.push(`${key} = ${toTomlValue(entries[key])}`);
  }
  return lines.join('\n');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mergeConfigs(existing, newConfig) {
  const result = { ...existing };
  for (const key in newConfig) {
    if (typeof newConfig[key] === 'object' && newConfig[key] !== null && !Array.isArray(newConfig[key])) {
      result[key] = mergeConfigs(result[key] || {}, newConfig[key]);
    } else {
      result[key] = newConfig[key];
    }
  }
  return result;
}

function buildServerDefinition(configInfo) {
  const base = {
    name: 'Claustrum',
    command: 'node',
    args: ['{{packagePath}}']
  };
  const overrides = configInfo.serverOverrides || {};
  return mergeConfigs(base, overrides);
}

function setDeep(target, pathKey, value) {
  const parts = pathKey.split('.');
  let current = target;
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i];
    if (i === parts.length - 1) {
      current[key] = value;
      return;
    }
    if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
      current[key] = {};
    }
    current = current[key];
  }
}

function buildConfigPayload(configInfo, platformId) {
  if (!configInfo.adapter) {
    return configInfo.structure || {};
  }

  const adapter = configInfo.adapter;
  const serverId = adapter.serverId || 'claustrum';
  const serverDef = buildServerDefinition(configInfo, platformId);
  const payload = adapter.rootExtras ? JSON.parse(JSON.stringify(adapter.rootExtras)) : {};
  const serverPayload = { [serverId]: serverDef };

  if (adapter.flatKey) {
    if (adapter.containerKey) {
      payload[adapter.flatKey] = {};
      setDeep(payload[adapter.flatKey], adapter.containerKey, serverPayload);
    } else {
      payload[adapter.flatKey] = serverPayload;
    }
    return payload;
  }

  if (adapter.containerKey) {
    setDeep(payload, adapter.containerKey, serverPayload);
  } else {
    payload[serverId] = serverDef;
  }
  return payload;
}

function findContextSyncConfig(config) {
  const search = (obj, currentPath = '') => {
    for (const key in obj) {
      if (key === 'claustrum') {
        return `${currentPath}.${key}`;
      }
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const found = search(obj[key], `${currentPath}.${key}`);
        if (found) return found;
      }
    }
    return null;
  };
  return search(config);
}

module.exports = {
  objectToYaml,
  processTemplate,
  toTomlValue,
  renderTomlTable,
  escapeRegex,
  buildServerDefinition,
  buildConfigPayload,
  setDeep,
  mergeConfigs,
  findContextSyncConfig,
};

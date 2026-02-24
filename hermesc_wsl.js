/**
 * WSL wrapper for hermesc - converts Windows paths to WSL paths and executes
 * the linux64-bin hermesc binary through WSL.
 */
const { execSync } = require('child_process');
const path = require('path');

const hermescLinux = path.resolve(__dirname, 'node_modules/hermes-compiler/hermesc/linux64-bin/hermesc');

// Convert a Windows path to WSL path
function toWslPath(winPath) {
  try {
    return execSync(`wsl wslpath -a '${winPath.replace(/\\/g, '\\\\')}'`, { encoding: 'utf8' }).trim();
  } catch {
    return winPath;
  }
}

// Convert hermesc path
const wslHermesc = toWslPath(hermescLinux);

// Convert arguments - replace Windows paths with WSL paths
const args = process.argv.slice(2).map(arg => {
  // Check if argument looks like a Windows path (drive letter + colon + separator)
  if (/^[A-Za-z]:[/\\]/.test(arg)) {
    return toWslPath(arg);
  }
  // Check if argument is a relative path containing backslashes
  if (arg.includes('\\') && !arg.startsWith('-')) {
    // Convert backslashes to forward slashes for WSL
    return arg.replace(/\\/g, '/');
  }
  return arg;
});

const command = `wsl "${wslHermesc}" ${args.map(a => `"${a}"`).join(' ')}`;

try {
  execSync(command, { stdio: 'inherit' });
} catch (e) {
  process.exit(e.status || 1);
}

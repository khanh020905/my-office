import fs from 'node:fs';
import path from 'node:path';

/**
 * Normalizes a filesystem path for consistent cross-platform representation (Windows & POSIX).
 * - Converts all separators to standard path.sep
 * - Eliminates redundant slashes and dots
 * - Trims trailing separators (except for root paths)
 */
export function normalizePath(inputPath) {
  if (typeof inputPath !== 'string' || !inputPath.trim()) return '';
  const resolved = path.resolve(inputPath);
  return resolved;
}

/**
 * Checks if a target path is safely contained within a base directory (path traversal guard).
 */
export function isSafePath(baseDir, targetPath) {
  if (!baseDir || !targetPath) return false;
  const base = path.resolve(baseDir);
  const target = path.resolve(targetPath);
  return target === base || target.startsWith(base + path.sep);
}

/**
 * Creates a directory symlink or NTFS junction on Windows, with graceful fallback to copy.
 * - On Windows: attempts 'junction' (requires no administrator rights)
 * - On POSIX: attempts standard directory symlink
 * - Fallback: performs a non-destructive directory copy if symlinks/junctions fail
 */
export function linkOrCopyDirectory(sourceDir, targetDir, { force = false } = {}) {
  const src = path.resolve(sourceDir);
  const dest = path.resolve(targetDir);

  if (!fs.existsSync(src)) {
    throw new Error(`Source directory does not exist: ${src}`);
  }

  if (fs.existsSync(dest)) {
    if (!force) {
      throw new Error(`Target directory already exists: ${dest}`);
    }
    fs.rmSync(dest, { recursive: true, force: true });
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });

  const isWindows = process.platform === 'win32';
  const symlinkType = isWindows ? 'junction' : 'dir';

  try {
    fs.symlinkSync(src, dest, symlinkType);
    return { method: symlinkType, path: dest };
  } catch (symlinkErr) {
    // If symlink/junction is disallowed by filesystem permissions or OS policy, fallback to copy
    try {
      copyDirectorySync(src, dest);
      return { method: 'copy', path: dest, note: symlinkErr.message };
    } catch (copyErr) {
      throw new Error(`Failed to link or copy directory from ${src} to ${dest}: ${copyErr.message}`);
    }
  }
}

/**
 * Recursive directory copy helper.
 */
export function copyDirectorySync(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  const entries = fs.readdirSync(source, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyDirectorySync(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Atomically writes a JSON payload to disk using a temp file and rename.
 */
export function atomicWriteJsonSync(filePath, data) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const tempPath = `${resolved}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  try {
    fs.renameSync(tempPath, resolved);
  } catch (err) {
    // Windows fallback if target exists and cannot be replaced atomically
    if (process.platform === 'win32' && err.code === 'EEXIST') {
      fs.copyFileSync(tempPath, resolved);
      try { fs.unlinkSync(tempPath); } catch {}
    } else {
      try { fs.unlinkSync(tempPath); } catch {}
      throw err;
    }
  }
}

/**
 * Acquires a simple sync lockfile with lease expiry.
 */
export function acquireLockSync(lockPath, { leaseMs = 10_000 } = {}) {
  const resolved = path.resolve(lockPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  let fd = null;
  const startTime = Date.now();

  while (Date.now() - startTime < 3000) {
    try {
      fd = fs.openSync(resolved, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
      break;
    } catch (err) {
      if (err.code === 'EEXIST') {
        try {
          const stat = fs.statSync(resolved);
          if (Date.now() - stat.mtimeMs > leaseMs) {
            fs.unlinkSync(resolved);
            continue;
          }
        } catch {}
      }
      // brief spin wait
      const sleepUntil = Date.now() + 25;
      while (Date.now() < sleepUntil) {}
    }
  }

  return function releaseLock() {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
      fd = null;
    }
    try {
      if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
    } catch {}
  };
}



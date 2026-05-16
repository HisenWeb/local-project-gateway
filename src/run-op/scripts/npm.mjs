import { section } from "./common.mjs";

export function npmProjectCheckScript() {
  return section(
    "npm project check",
    `Write-Output '--- npm version ---'
npm --version
Write-Output '--- npm run check ---'
npm run check`
  );
}

export function npmDependencyCheckScript() {
  return section(
    "npm dependency check",
    `Write-Output '--- package files ---'
Test-Path (Join-Path $Root 'package.json')
Test-Path (Join-Path $Root 'package-lock.json')
Test-Path (Join-Path $Root 'node_modules')
Write-Output '--- npm ls depth 0 ---'
npm ls --depth=0 --omit=dev`
  );
}

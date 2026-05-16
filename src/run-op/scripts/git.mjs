import { section } from "./common.mjs";

export function gitRemoteScript() {
  return section(
    "Git remote",
    `git --version
git -C $Root rev-parse --show-toplevel
git -C $Root remote -v
git -C $Root branch --show-current`
  );
}

export function gitStatusScript() {
  return section(
    "Git status",
    `if (!(Get-Command git.exe -ErrorAction SilentlyContinue)) { throw "git.exe not found" }
if (!(Test-Path (Join-Path $Root '.git'))) { throw "Not a git repository: $Root" }
git -C $Root status --short --branch`
  );
}

export function gitLogLatestScript() {
  return section(
    "Latest git commits",
    `if (!(Get-Command git.exe -ErrorAction SilentlyContinue)) { throw "git.exe not found" }
if (!(Test-Path (Join-Path $Root '.git'))) { throw "Not a git repository: $Root" }
git -C $Root --no-pager log --oneline -n 8`
  );
}

export function gitDiffSummaryScript() {
  return section(
    "Git diff summary",
    `if (!(Get-Command git.exe -ErrorAction SilentlyContinue)) { throw "git.exe not found" }
if (!(Test-Path (Join-Path $Root '.git'))) { throw "Not a git repository: $Root" }
Write-Output '--- status ---'
git -C $Root status --short --branch
Write-Output '--- diff name only ---'
git -C $Root diff --name-only
Write-Output '--- diff stat ---'
git -C $Root diff --stat`
  );
}

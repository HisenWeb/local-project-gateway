import { section } from "./common.mjs";

export function gatewaySmokeScript() {
  return section(
    "Readonly gateway smoke",
    `Write-Output '--- gateway /health ---'
curl.exe -i http://127.0.0.1:3333/health
Write-Output '--- gateway /projects ---'
curl.exe -i http://127.0.0.1:3333/projects`
  );
}

export function gatewayConfigCheckScript() {
  return section(
    "Gateway config check",
    `Write-Output '--- config file selection ---'
Write-Output "PROJECTS_CONFIG_Set=$([bool]$env:PROJECTS_CONFIG)"
Write-Output "projects.example.json Exists=$(Test-Path (Join-Path $Root 'projects.example.json'))"
Write-Output "projects.local.json Exists=$(Test-Path (Join-Path $Root 'projects.local.json'))"
Write-Output ".env.local Exists=$(Test-Path (Join-Path $Root '.env.local'))"
Write-Output '--- projects.example.json shape ---'
$ExampleProjects = Join-Path $Root 'projects.example.json'
if (Test-Path $ExampleProjects) {
  try {
    $ExampleJson = Get-Content $ExampleProjects -Raw | ConvertFrom-Json
    Write-Output "ExampleProjectCount=$(@($ExampleJson.projects).Count)"
  } catch {
    Write-Output 'ExampleJsonParse=FAILED'
    Write-Output $_.Exception.Message
  }
}
Write-Output '--- projects.local.json shape, roots hidden ---'
$LocalProjects = Join-Path $Root 'projects.local.json'
if (Test-Path $LocalProjects) {
  try {
    $LocalJson = Get-Content $LocalProjects -Raw | ConvertFrom-Json
    Write-Output "LocalProjectCount=$(@($LocalJson.projects).Count)"
    @($LocalJson.projects) | Select-Object id,name | Format-Table -AutoSize
  } catch {
    Write-Output 'LocalJsonParse=FAILED'
    Write-Output $_.Exception.Message
  }
}`
  );
}

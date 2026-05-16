import { section } from "./common.mjs";

export function cloudflaredDiagnoseScript() {
  return section(
    "cloudflared diagnose",
    `Write-Output '--- cloudflared process ---'
Get-CimInstance Win32_Process -Filter "name='cloudflared.exe'" |
  Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine,CreationDate |
  Format-List
Write-Output '--- cloudflared service ---'
Get-Service cloudflared -ErrorAction SilentlyContinue |
  Select-Object Name,Status,StartType |
  Format-Table -AutoSize
Write-Output '--- cloudflared version ---'
if (Test-Path $CloudflaredExe) { & $CloudflaredExe --version } else { Write-Output "cloudflared exe not found: $CloudflaredExe" }
Write-Output '--- tunnel list ---'
if (Test-Path $CloudflaredExe) { & $CloudflaredExe tunnel list }
Write-Output '--- tunnel info ---'
if (Test-Path $CloudflaredExe) { & $CloudflaredExe tunnel info $CloudflaredTunnel }
Write-Output '--- public health ---'
curl.exe -i "$PublicBaseUrl/health"
Write-Output '--- DNS ---'
Resolve-DnsName $PublicHost -Type CNAME -Server 1.1.1.1 -ErrorAction SilentlyContinue
Resolve-DnsName $PublicHost -Type A -Server 1.1.1.1 -ErrorAction SilentlyContinue
Resolve-DnsName $PublicHost -Type AAAA -Server 1.1.1.1 -ErrorAction SilentlyContinue
Write-Output '--- cloudflared log tail ---'
Get-Content $CloudflaredLog -Tail 200 -ErrorAction SilentlyContinue`
  );
}

export function cloudflaredServiceDetailScript() {
  return section(
    "cloudflared service detail",
    `Write-Output '--- service status ---'
Get-Service cloudflared -ErrorAction SilentlyContinue |
  Select-Object Name,Status,StartType,ServiceType,CanStop |
  Format-List
Write-Output '--- service metadata without command line ---'
$CloudflaredService = Get-CimInstance Win32_Service -Filter "Name='cloudflared'" -ErrorAction SilentlyContinue
if ($CloudflaredService) {
  $CloudflaredService |
    Select-Object Name,State,StartMode,StartName,ProcessId,ExitCode,ServiceSpecificExitCode |
    Format-List
  Write-Output "PathNamePresent=$([bool]$CloudflaredService.PathName)"
} else {
  Write-Output 'cloudflared service not found'
}`
  );
}

export function cloudflaredConfigCheckScript() {
  return section(
    "cloudflared config check",
    `$ConfigCandidates = @(
  (Join-Path $env:USERPROFILE '.cloudflared\\config.yml'),
  (Join-Path $env:USERPROFILE '.cloudflared\\config.yaml'),
  (Join-Path $env:ProgramData 'cloudflared\\config.yml'),
  (Join-Path $env:ProgramData 'cloudflared\\config.yaml'),
  (Join-Path $Root 'cloudflared.yml'),
  (Join-Path $Root 'cloudflared.yaml')
) | Select-Object -Unique
foreach ($ConfigPath in $ConfigCandidates) {
  Write-Output "Candidate=$ConfigPath Exists=$(Test-Path $ConfigPath)"
  if (Test-Path $ConfigPath) {
    Write-Output '--- selected non-secret config keys ---'
    Select-String -Path $ConfigPath -Pattern '^\s*(tunnel|credentials-file|ingress|hostname|service):' -ErrorAction SilentlyContinue |
      ForEach-Object {
        $Line = $_.Line
        $Line = $Line -replace '(?i)^(\s*tunnel\s*:\s*).+$', '$1[REDACTED]'
        $Line = $Line -replace '(?i)^(\s*credentials-file\s*:\s*).+$', '$1[REDACTED_PATH]'
        Write-Output $Line
      }
  }
}
Write-Output "Env_CLOUDFLARED_EXE_Set=$([bool]$env:CLOUDFLARED_EXE)"
Write-Output "Env_CLOUDFLARED_LOG_Set=$([bool]$env:CLOUDFLARED_LOG)"
Write-Output "Env_CLOUDFLARED_TUNNEL_Set=$([bool]$env:CLOUDFLARED_TUNNEL)"`
  );
}

export function cloudflaredIngressCheckScript() {
  return section(
    "cloudflared ingress check",
    `Write-Output "CloudflaredExeExists=$(Test-Path $CloudflaredExe)"
if (Test-Path $CloudflaredExe) {
  Write-Output '--- tunnel ingress validate ---'
  & $CloudflaredExe tunnel ingress validate
} else {
  Write-Output "cloudflared exe not found: $CloudflaredExe"
}`
  );
}

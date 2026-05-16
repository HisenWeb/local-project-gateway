import { section } from "./common.mjs";

export function dnsCheckScript() {
  return section(
    "DNS check",
    `Resolve-DnsName $PublicHost -Type CNAME -Server 1.1.1.1 -ErrorAction SilentlyContinue
Resolve-DnsName $PublicHost -Type A -Server 1.1.1.1 -ErrorAction SilentlyContinue
Resolve-DnsName $PublicHost -Type AAAA -Server 1.1.1.1 -ErrorAction SilentlyContinue`
  );
}

export function dnsLocalCheckScript() {
  return section(
    "Local DNS check",
    `Write-Output '--- system resolver ---'
Resolve-DnsName $PublicHost -Type CNAME -ErrorAction SilentlyContinue
Resolve-DnsName $PublicHost -Type A -ErrorAction SilentlyContinue
Resolve-DnsName $PublicHost -Type AAAA -ErrorAction SilentlyContinue
Write-Output '--- hosts file match ---'
$HostsFile = Join-Path $env:SystemRoot 'System32\\drivers\\etc\\hosts'
if (Test-Path $HostsFile) {
  Select-String -Path $HostsFile -Pattern $PublicHost -SimpleMatch -ErrorAction SilentlyContinue |
    ForEach-Object { $_.Line }
} else {
  Write-Output 'hosts file not found'
}`
  );
}

export function networkProxyCheckScript() {
  return section(
    "Network proxy check",
    `Write-Output '--- WinHTTP proxy ---'
netsh winhttp show proxy
Write-Output '--- process proxy env names only ---'
Get-ChildItem Env:HTTP_PROXY,Env:HTTPS_PROXY,Env:ALL_PROXY,Env:NO_PROXY -ErrorAction SilentlyContinue |
  Select-Object Name |
  Format-Table -AutoSize`
  );
}

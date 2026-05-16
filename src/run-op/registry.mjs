import { config } from "../config.mjs";
import { diagnosticScriptHeader } from "./scripts/common.mjs";
import {
  checkEnvScript,
  checkPortsScript,
  healthCheckScript,
  processNodeScript,
  statusServicesScript
} from "./scripts/system.mjs";
import {
  dnsCheckScript,
  dnsLocalCheckScript,
  networkProxyCheckScript
} from "./scripts/network.mjs";
import {
  gatewayConfigCheckScript,
  gatewaySmokeScript
} from "./scripts/gateway.mjs";
import {
  mcpPublicSmokeScript,
  oauthClientCheckScript,
  oauthMetadataScript
} from "./scripts/oauth.mjs";
import { tailLogsScript } from "./scripts/logs.mjs";
import {
  cloudflaredConfigCheckScript,
  cloudflaredDiagnoseScript,
  cloudflaredIngressCheckScript,
  cloudflaredServiceDetailScript
} from "./scripts/cloudflared.mjs";
import {
  gitDiffSummaryScript,
  gitLogLatestScript,
  gitRemoteScript,
  gitStatusScript
} from "./scripts/git.mjs";
import {
  npmDependencyCheckScript,
  npmProjectCheckScript
} from "./scripts/npm.mjs";

function diagnoseAllScript() {
  return [
    checkEnvScript(),
    gatewayConfigCheckScript(),
    checkPortsScript(),
    processNodeScript(),
    statusServicesScript(),
    gatewaySmokeScript(),
    healthCheckScript(),
    mcpPublicSmokeScript(),
    oauthMetadataScript(),
    oauthClientCheckScript(),
    dnsCheckScript(),
    dnsLocalCheckScript(),
    networkProxyCheckScript(),
    cloudflaredDiagnoseScript(),
    cloudflaredServiceDetailScript(),
    cloudflaredConfigCheckScript(),
    cloudflaredIngressCheckScript(),
    gitStatusScript(),
    gitLogLatestScript(),
    npmDependencyCheckScript()
  ].join("\n");
}

const runOpScripts = {
  diagnose_all: diagnoseAllScript,
  check_env: checkEnvScript,
  check_ports: checkPortsScript,
  process_node: processNodeScript,
  health_check: healthCheckScript,
  gateway_smoke: gatewaySmokeScript,
  mcp_public_smoke: mcpPublicSmokeScript,
  oauth_metadata_check: oauthMetadataScript,
  oauth_client_check: oauthClientCheckScript,
  dns_check: dnsCheckScript,
  dns_local_check: dnsLocalCheckScript,
  cloudflared_diagnose: cloudflaredDiagnoseScript,
  cloudflared_service_detail: cloudflaredServiceDetailScript,
  cloudflared_config_check: cloudflaredConfigCheckScript,
  cloudflared_ingress_check: cloudflaredIngressCheckScript,
  network_proxy_check: networkProxyCheckScript,
  tail_logs: tailLogsScript,
  git_remote: gitRemoteScript,
  git_status: gitStatusScript,
  git_log_latest: gitLogLatestScript,
  git_diff_summary: gitDiffSummaryScript,
  npm_project_check: npmProjectCheckScript,
  npm_dependency_check: npmDependencyCheckScript,
  gateway_config_check: gatewayConfigCheckScript,
  status_services: statusServicesScript
};

export function getMissingRunOpImplementations() {
  return config.runOpIds.filter((op) => !runOpScripts[op]);
}

export function getRunOpScript(op) {
  const buildScript = runOpScripts[op];

  if (!buildScript) {
    return "";
  }

  return `${diagnosticScriptHeader()}${buildScript()}`;
}

import "server-only";

import { jsonFileStore } from "../data/json-file";
import { instance } from "../instance";
import { mobileConsoleEnabled, operatorAudit, operatorDevices } from "../operator-devices";
import { pushSender } from "../push";
import { quietState } from "./decide";
import { alertsService, documentAlertsStore, type Alerts, type AlertsContents } from "./service";

let built: Alerts | null = null;

/**
 * The instance's alerts to operators' phones (docs/mobile/plan.md, section 18.9). One per process. What it
 * depends on is looked up each time it is used, so a changed secret, config or set of credentials is followed.
 */
export function alerts(): Alerts {
  built ??= alertsService({
    store: documentAlertsStore(jsonFileStore<AlertsContents>("operator-alerts.json", (value) => ({ lease: value.lease ?? null, state: value.state ?? quietState(), refused: value.refused ?? {} }))),
    sessions: operatorDevices,
    audit: operatorAudit,
    sender: pushSender,
    enabled: mobileConsoleEnabled,
    name: async () => (await instance()).name,
  });
  return built;
}

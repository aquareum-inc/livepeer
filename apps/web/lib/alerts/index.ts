import "server-only";

import { after } from "next/server";

import { storeOver } from "../data/database";
import { instance } from "../instance";
import { mobileConsoleEnabled, operatorAudit, operatorDevices } from "../operator-devices";
import { pushSender } from "../push";
import { postgresAlertsStore } from "./postgres";
import { alertsService, type Alerts } from "./service";

const store = storeOver(postgresAlertsStore);

let built: { store: ReturnType<typeof store>; alerts: Alerts } | null = null;

/**
 * The instance's alerts to operators' phones (docs/mobile/plan.md, section 18.9). One per process and per
 * place its state is kept. What it depends on is looked up each time it is used, so a changed secret, config
 * or set of credentials is followed.
 */
export function alerts(): Alerts {
  const kept = store();
  if (built?.store !== kept) {
    built = {
      store: kept,
      alerts: alertsService({
        store: kept,
        sessions: operatorDevices,
        audit: operatorAudit,
        sender: pushSender,
        enabled: mobileConsoleEnabled,
        name: async () => (await instance()).name,
        // A send a request sets off is finished after the answer has gone. On a host that stops between
        // requests the host has to be told to wait for it; outside a request there is nothing to tell.
        keepAlive(work) {
          try {
            after(work);
          } catch {
            // Not in a request: a timer or a test. The process is there until the work is done.
          }
        },
      }),
    };
  }
  return built.alerts;
}

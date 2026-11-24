import "server-only";

import { sessionSecret } from "../auth/session";
import { storeOver } from "../data/database";
import { instance } from "../instance";
import { auditLog, type AuditLog } from "./audit";
import { postgresAuditStore, postgresOperatorDeviceStore } from "./postgres";
import { operatorDeviceSessions, type OperatorDeviceSessions } from "./sessions";

const auditStore = storeOver(postgresAuditStore);
const sessionStore = storeOver(postgresOperatorDeviceStore);

/** The record of what operators' phones did and were refused. */
export function operatorAudit(): AuditLog {
  return auditLog(auditStore(sessionSecret()));
}

/** The instance's operator device sessions. */
export function operatorDevices(): OperatorDeviceSessions {
  const secret = sessionSecret();
  return operatorDeviceSessions(sessionStore(secret), secret, operatorAudit());
}

/** Whether the instance offers the console inside the native apps. Off unless an operator turned it on. */
export async function mobileConsoleEnabled(): Promise<boolean> {
  return (await instance()).surfaces.mobileConsole === true;
}

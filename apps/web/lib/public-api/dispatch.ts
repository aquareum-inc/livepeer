import { ApiError, type Context, type Operation } from "./operations";

/**
 * What an operator device session may call besides the operator operations marked for phones: what the app
 * needs to draw itself, and the session's own plumbing. Everything else a user can do is refused, so the
 * console's session can never run a job or spend credit.
 */
export const OPEN_TO_OPERATOR_DEVICES: readonly string[] = ["get_instance", "get_me", "create_operator_challenge", "unlock_operator_device_session", "delete_operator_device_session"];

/** What a change acted on, for the audit log. */
const target = (input: Record<string, unknown>): string | null => (typeof input.id === "string" ? input.id : null);

/**
 * Runs an operation for a caller. This is the only place an operation's `run` is called for a request, and
 * the one place the rules for an operator's phone are applied, in order, refusing at the first failure:
 * the console is offered on phones; the operation is one a phone may call (an allow-list: no mark means web
 * only); a read needs an unlocked session; a change needs its own unused proof for exactly this operation
 * and input. Refusals and changes are written to the audit log. The `operator(context)` guard inside each
 * operator operation stays as the second line.
 */
export async function runOperation(operation: Operation, context: Context, input: Record<string, unknown>, proof: string | null): Promise<unknown> {
  if (context.via !== "operator_device") return operation.run(context, input);

  const session = context.operatorDevice;
  // An operator-device caller without its session can't be checked, so it can't be served.
  if (!session) throw new ApiError(401, "That token isn't valid, or it has been revoked.", "signed_out");
  const actor = { userId: session.userId, name: session.name, deviceId: session.id, deviceName: session.deviceName };
  /** Writes the refusal down and answers with the error to throw. */
  const refusal = async (status: number, message: string, code: string): Promise<ApiError> => {
    await context.audit.write("refused", actor, { operation: operation.name, target: target(input), detail: code });
    return new ApiError(status, message, code);
  };

  if (!context.instance.surfaces.mobile_console) throw new ApiError(403, "This service doesn't offer its console on phones.", "mobile_console_off");
  if (!(await context.operatorDevices.allow(session.id))) throw await refusal(429, "Too many requests from this phone. Wait a minute.", "rate_limited");

  if (!operation.operator) {
    if (!OPEN_TO_OPERATOR_DEVICES.includes(operation.name)) throw await refusal(403, "The console's session can't do this. Use the app itself.", "operator_session");
    return operation.run(context, input);
  }
  if (!operation.mobile) throw await refusal(403, "This is done on the web console, not on a phone.", "web_only");

  if (operation.mobile === "read") {
    if (!context.operatorDevices.unlocked(session)) throw await refusal(401, "The console is locked on this phone.", "locked");
    return operation.run(context, input);
  }

  if (!proof) throw await refusal(401, "This change needs its own confirmation from this phone.", "proof_required");
  // A proof that is presented and wrong is written down and counted where it is checked.
  if (!(await context.operatorDevices.prove(session, operation.name, input, proof))) throw new ApiError(401, "That confirmation wasn't valid for this change. Confirm it again.", "proof_required");

  try {
    const value = await operation.run(context, input);
    await context.audit.write("change", actor, { operation: operation.name, target: target(input), detail: describeChange(operation.name, input) });
    return value;
  } catch (cause) {
    await context.audit.write("change", actor, { operation: operation.name, target: target(input), detail: `failed: ${cause instanceof Error ? cause.message : "unknown"}`.slice(0, 200) });
    throw cause;
  }
}

/**
 * The decision a change carried, in the request's own words: "paused", "hidden", or which alerts were
 * switched on. Never the whole input, and never a push token.
 */
function describeChange(operation: string, input: Record<string, unknown>): string | null {
  // Only for the operation that takes kinds, and has checked them: an extra field on another change can't put words here.
  if (operation === "operator_set_alerts") return Array.isArray(input.kinds) && input.kinds.length > 0 ? `alerts on: ${input.kinds.map(String).join(", ")}`.slice(0, 120) : "alerts off";
  const value = input.status ?? input.outcome;
  return typeof value === "string" ? value.slice(0, 40) : null;
}

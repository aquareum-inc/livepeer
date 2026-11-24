import { NextResponse, type NextRequest } from "next/server";

import { instance } from "@/lib/instance";
import { authenticate, requestContext, type Caller } from "@/lib/public-api/auth";
import { runOperation } from "@/lib/public-api/dispatch";
import { ApiError, OPERATIONS } from "@/lib/public-api/operations";

export const dynamic = "force-dynamic";

const PROTOCOL = "2025-06-18";

/** The operations offered as tools: all of them except the native apps' sign-in plumbing. */
const TOOLS = OPERATIONS.filter((operation) => operation.mcp !== false);

interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const result = (id: RpcRequest["id"], value: unknown) => ({ jsonrpc: "2.0" as const, id: id ?? null, result: value });
const failure = (id: RpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } });

/**
 * The MCP server (streamable HTTP, stateless). Its tools are the same operations as the REST
 * API, so an agent can do what the interface can.
 */
export async function POST(request: NextRequest) {
  let caller: Caller | null;
  try {
    caller = await authenticate(request);
  } catch (cause) {
    if (!(cause instanceof ApiError)) throw cause;
    caller = null;
  }
  // The console on a phone speaks the REST API only: its session is never an agent's.
  if (!caller || caller.via === "operator_device") {
    return NextResponse.json(failure(null, -32001, "Send an API key as a bearer token."), { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  }

  let rpc: RpcRequest;
  try {
    rpc = (await request.json()) as RpcRequest;
  } catch {
    return NextResponse.json(failure(null, -32700, "Parse error"), { status: 400 });
  }

  // Notifications carry no id and get no body.
  if (rpc.id === undefined) return new NextResponse(null, { status: 202 });

  switch (rpc.method) {
    case "initialize":
      return NextResponse.json(
        result(rpc.id, {
          protocolVersion: typeof rpc.params?.protocolVersion === "string" ? rpc.params.protocolVersion : PROTOCOL,
          capabilities: { tools: {} },
          serverInfo: { name: (await instance()).name, version: "0.1.0" },
          instructions: "Generate, edit and understand video on this instance. Start with list_capabilities; generation is asynchronous, so poll get_generation.",
        }),
      );
    case "ping":
      return NextResponse.json(result(rpc.id, {}));
    case "tools/list":
      return NextResponse.json(
        result(rpc.id, {
          tools: TOOLS.filter((operation) => !operation.operator || caller.operator).map(({ name, description, input }) => ({ name, description, inputSchema: input })),
        }),
      );
    case "tools/call": {
      const operation = TOOLS.find((entry) => entry.name === rpc.params?.name);
      if (!operation) return NextResponse.json(failure(rpc.id, -32602, `Unknown tool: ${String(rpc.params?.name)}`));
      try {
        const value = await runOperation(operation, await requestContext(request, caller), (rpc.params?.arguments as Record<string, unknown> | undefined) ?? {}, null);
        return NextResponse.json(result(rpc.id, { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: Array.isArray(value) ? { items: value } : value }));
      } catch (cause) {
        return NextResponse.json(result(rpc.id, { isError: true, content: [{ type: "text", text: cause instanceof Error ? cause.message : "The tool failed." }] }));
      }
    }
    default:
      return NextResponse.json(failure(rpc.id, -32601, `Method not found: ${rpc.method}`));
  }
}

/** This server doesn't open a stream for server-initiated messages. */
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

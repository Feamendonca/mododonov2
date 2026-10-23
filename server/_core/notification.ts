import { TRPCError } from "@trpc/server";
import { ENV } from "./env";
import { getDb } from "../db";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const buildEndpointUrl = (baseUrl: string): string => {
  const normalizedBase = baseUrl.endsWith("/")
    ? baseUrl
    : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

/**
 * Dispatches a project-owner notification through the Manus Notification Service.
 * Returns `true` if the request was accepted, `false` when the upstream service
 * cannot be reached (callers can fall back to email/slack). Validation errors
 * bubble up as TRPC errors so callers can fix the payload.
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured.",
    });
  }

  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured.",
    });
  }

  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1",
      },
      body: JSON.stringify({ title, content }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${
          detail ? `: ${detail}` : ""
        }`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

/**
 * Resolve o openId do gerente de uma loja e dispara uma notificação para ele.
 *
 * Estratégia de resolução (em ordem de prioridade):
 *  1. Employee com papelRemuneravel='gestor' e userId preenchido → users.openId
 *  2. Fallback: usuário em user_stores com role='gerente'
 *
 * Se não achar gerente, loga e retorna false (não quebra o cron).
 */
export async function notifyManager(
  storeId: number,
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    console.warn("[Notification] notifyManager: forge env not configured");
    return false;
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Notification] notifyManager: DB unavailable");
    return false;
  }

  // Estratégia 1: employee com papelRemuneravel='gestor' e userId preenchido
  let managerOpenId: string | null = null;
  try {
    const [rows] = await (db as any).$client.promise().execute(
      `SELECT u.openId
       FROM employees e
       JOIN users u ON u.id = e.userId
       WHERE e.storeId = ? AND e.papelRemuneravel = 'gestor' AND e.userId IS NOT NULL
       LIMIT 1`,
      [storeId]
    );
    if ((rows as any[]).length > 0) {
      managerOpenId = (rows as any[])[0].openId as string;
    }
  } catch (err) {
    console.warn("[Notification] notifyManager: error resolving via employees", err);
  }

  // Estratégia 2: fallback — user_stores com role='gerente'
  if (!managerOpenId) {
    try {
      const [rows] = await (db as any).$client.promise().execute(
        `SELECT u.openId
         FROM user_stores us
         JOIN users u ON u.id = us.userId
         WHERE us.storeId = ? AND u.role = 'gerente'
         LIMIT 1`,
        [storeId]
      );
      if ((rows as any[]).length > 0) {
        managerOpenId = (rows as any[])[0].openId as string;
      }
    } catch (err) {
      console.warn("[Notification] notifyManager: error resolving via user_stores", err);
    }
  }

  if (!managerOpenId) {
    console.info(`[Notification] notifyManager: no manager found for store ${storeId} — skipping`);
    return false;
  }

  // Disparar notificação para o gerente via openId
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1",
      },
      body: JSON.stringify({ title, content, open_id: managerOpenId }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(`[Notification] notifyManager failed (${response.status})${detail ? `: ${detail}` : ""}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] notifyManager: error calling notification service:", error);
    return false;
  }
}

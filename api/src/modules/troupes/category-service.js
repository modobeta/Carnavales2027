import { createHash } from "node:crypto";
import { getPool } from "../../db/pool.js";
import { requireConfiguringEvent, requireEventExists } from "../events/event-service.js";

export const TROUPE_LOGO_MAX_BYTES = 1048576;
export const TROUPE_LOGO_MIMES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

function ascii(buffer, start, end) {
  return buffer.subarray(start, end).toString("latin1");
}

/**
 * El MIME declarado por el cliente no se confía: se deduce de la firma de los
 * primeros bytes. SVG se acepta sólo si el marcado empieza por <svg.
 */
function detectTroupeLogoMime(data) {
  if (data.length >= 8 && data[0] === 0x89 && ascii(data, 1, 4) === "PNG") return "image/png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 12 && ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 12) === "WEBP") return "image/webp";
  if (/<svg[\s>]/i.test(ascii(data, 0, Math.min(data.length, 1024)))) return "image/svg+xml";
  return null;
}

export function validateTroupeLogo({ data, mime }) {
  if (!Buffer.isBuffer(data) || data.length === 0) throw new TypeError("logoData debe ser un archivo no vacío.");
  if (data.length > TROUPE_LOGO_MAX_BYTES) throw new TypeError("El logo no puede superar 1 MB.");
  const detected = detectTroupeLogoMime(data);
  if (!detected) throw new TypeError("El logo debe ser un PNG, JPG, WebP o SVG válido.");
  if (mime !== undefined && mime !== null && mime !== detected) {
    throw new TypeError(`El tipo declarado (${mime}) no coincide con el contenido (${detected}).`);
  }
  return { data, mime: detected, sha256: createHash("sha256").update(data).digest("hex") };
}

function text(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} debe ser texto no vacío.`);
  return value.trim();
}

function order(value) {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError("displayOrder debe ser entero positivo.");
  return value;
}

function optionalBoolean(value, name) {
  if (value === undefined) return null;
  if (typeof value !== "boolean") throw new TypeError(`${name} debe ser booleano.`);
  return value;
}

const BRAND_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function optionalBrandColor(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new TypeError("brandColor debe ser texto #RRGGBB o nulo.");
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!BRAND_COLOR_PATTERN.test(trimmed)) throw new TypeError("brandColor debe tener formato #RRGGBB.");
  return trimmed;
}

export async function createCategory({ client = getPool(), eventId, name, code, displayOrder }) {
  await requireConfiguringEvent({ client, eventId });
  const { rows } = await client.query(
    `INSERT INTO event_category (event_id, name, code, display_order)
     VALUES ($1, $2, $3, COALESCE($4, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM event_category WHERE event_id = $1)))
     RETURNING id, event_id AS "eventId", name, code, display_order AS "displayOrder", active`,
    [text(eventId, "eventId"), text(name, "name"), text(code, "code"), displayOrder === undefined ? null : order(displayOrder)],
  );
  return rows[0];
}

export async function listCategories({ client = getPool(), eventId, eligible = false }) {
  await requireEventExists({ client, eventId });
  const { rows } = await client.query(
    `SELECT id, event_id AS "eventId", name, code, display_order AS "displayOrder", active
       FROM event_category
      WHERE event_id = $1 ${eligible ? "AND active = true" : ""}
      ORDER BY display_order`,
    [text(eventId, "eventId")],
  );
  return rows;
}

export async function updateCategory({ client = getPool(), categoryId, name, code, displayOrder, active }) {
  const { rows } = await client.query(
    `UPDATE event_category
        SET name = COALESCE($2, name),
            code = COALESCE($3, code),
            display_order = COALESCE($4, display_order),
            active = COALESCE($5, active),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, event_id AS "eventId", name, code, display_order AS "displayOrder", active`,
    [
      text(categoryId, "categoryId"),
      name === undefined ? null : text(name, "name"),
      code === undefined ? null : text(code, "code"),
      displayOrder === undefined ? null : order(displayOrder),
      optionalBoolean(active, "active"),
    ],
  );
  if (!rows[0]) throw new Error("CATEGORY_NOT_FOUND");
  return rows[0];
}

export async function createTroupe({ client = getPool(), eventId, categoryId, name, brandColor = undefined }) {
  await requireConfiguringEvent({ client, eventId });
  const { rows } = await client.query(
    `INSERT INTO event_troupe (event_id, category_id, name, brand_color) VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [text(eventId, "eventId"), text(categoryId, "categoryId"), text(name, "name"), optionalBrandColor(brandColor)],
  );
  const { rows: created } = await client.query(
    `SELECT t.id, t.event_id AS "eventId", t.category_id AS "categoryId", t.name, t.active,
            t.brand_color AS "brandColor",
            (t.logo_data IS NOT NULL) AS "hasLogo", t.logo_sha256 AS "logoSha256",
            c.name AS "categoryName", c.code AS "categoryCode", c.active AS "categoryActive"
       FROM event_troupe t
       JOIN event_category c ON c.id = t.category_id
      WHERE t.id = $1`,
    [rows[0].id],
  );
  return created[0];
}

export async function listTroupes({ client = getPool(), eventId }) {
  await requireEventExists({ client, eventId });
  const { rows } = await client.query(
    `SELECT t.id, t.event_id AS "eventId", t.category_id AS "categoryId", t.name, t.active,
            t.brand_color AS "brandColor",
            (t.logo_data IS NOT NULL) AS "hasLogo", t.logo_sha256 AS "logoSha256",
            c.name AS "categoryName", c.code AS "categoryCode", c.active AS "categoryActive"
       FROM event_troupe t
       JOIN event_category c ON c.id = t.category_id
      WHERE t.event_id = $1
      ORDER BY t.name`,
    [text(eventId, "eventId")],
  );
  return rows;
}

export async function updateTroupe({ client = getPool(), troupeId, categoryId, name, active, brandColor = undefined }) {
  const { rows } = await client.query(
    `UPDATE event_troupe
        SET category_id = COALESCE($2, category_id),
            name = COALESCE($3, name),
            active = COALESCE($4, active),
            brand_color = CASE WHEN $6 = TRUE THEN brand_color ELSE $5 END,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, event_id AS "eventId", category_id AS "categoryId", name, active, brand_color AS "brandColor",
                (logo_data IS NOT NULL) AS "hasLogo", logo_sha256 AS "logoSha256"`,
    [
      text(troupeId, "troupeId"),
      categoryId === undefined ? null : text(categoryId, "categoryId"),
      name === undefined ? null : text(name, "name"),
      optionalBoolean(active, "active"),
      brandColor === undefined ? null : optionalBrandColor(brandColor),
      brandColor === undefined,
    ],
  );
  if (!rows[0]) throw new Error("TROUPE_NOT_FOUND");
  return rows[0];
}

/**
 * Logo de comparsa. Los bytes viven en PostgreSQL (BYTEA) y nunca se devuelven
 * en listados: las respuestas incluyen sólo `hasLogo` y `logoSha256` para que el
 * cliente arme la URL cacheable `/api/v1/troupes/:troupeId/logo`.
 */
export async function getTroupeLogo({ client = getPool(), troupeId }) {
  const { rows } = await client.query(
    `SELECT id, logo_data AS "logoData", logo_mime AS "logoMime", logo_sha256 AS "logoSha256", logo_updated_at AS "logoUpdatedAt"
       FROM event_troupe WHERE id = $1`,
    [text(troupeId, "troupeId")],
  );
  if (!rows[0]) throw new Error("TROUPE_NOT_FOUND");
  if (!rows[0].logoData) return null;
  return rows[0];
}

export async function setTroupeLogo({ client = getPool(), troupeId, data, mime }) {
  const logo = validateTroupeLogo({ data, mime });
  const { rows } = await client.query(
    `UPDATE event_troupe
        SET logo_data = $2, logo_mime = $3, logo_sha256 = $4, logo_updated_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, event_id AS "eventId", name, (logo_data IS NOT NULL) AS "hasLogo", logo_sha256 AS "logoSha256"`,
    [text(troupeId, "troupeId"), logo.data, logo.mime, logo.sha256],
  );
  if (!rows[0]) throw new Error("TROUPE_NOT_FOUND");
  return rows[0];
}

export async function deleteTroupeLogo({ client = getPool(), troupeId }) {
  const { rows } = await client.query(
    `UPDATE event_troupe
        SET logo_data = NULL, logo_mime = NULL, logo_sha256 = NULL, logo_updated_at = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, event_id AS "eventId", name, (logo_data IS NOT NULL) AS "hasLogo"`,
    [text(troupeId, "troupeId")],
  );
  if (!rows[0]) throw new Error("TROUPE_NOT_FOUND");
  return rows[0];
}

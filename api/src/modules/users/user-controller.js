import * as userService from "./user-service.js";

const roleCodePattern = /^[A-Z_]{2,40}$/;
const maxSearchLength = 100;
const maxListLimit = 50;

function readOptionalString(value) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new TypeError("parámetro inválido");
  return value.trim();
}

function parseUserListQuery(query) {
  const role = readOptionalString(query.role);
  const excludeRole = readOptionalString(query.excludeRole);
  const search = readOptionalString(query.q);
  const rawLimit = readOptionalString(query.limit);
  const limit = rawLimit === undefined ? undefined : Number(rawLimit);

  if (role !== undefined && !roleCodePattern.test(role)) throw new TypeError("role inválido");
  if (excludeRole !== undefined && !roleCodePattern.test(excludeRole)) throw new TypeError("excludeRole inválido");
  if (search !== undefined && (search.length < 2 || search.length > maxSearchLength)) throw new TypeError("q inválido");
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > maxListLimit)) {
    throw new TypeError("limit inválido");
  }
  return { role, excludeRole, search, limit };
}

export const listUsers = async (req, res, next) => {
  let filters;
  try {
    filters = parseUserListQuery(req.query);
  } catch {
    return res.status(400).json({ code: "VALIDATION_ERROR" });
  }
  try {
    const users = await userService.listUsers(filters);
    res.json(users);
  } catch (error) {
    next(error);
  }
};

export const inviteUser = async (req, res, next) => {
  try {
    const { email, roleCode } = req.body;
    if (!email || !roleCode) {
      return res.status(400).json({ code: "BAD_REQUEST", message: "Email y roleCode son requeridos" });
    }
    const invitation = await userService.inviteRoleUser(email, roleCode, req.user.id);
    res.status(201).json(invitation);
  } catch (error) {
    if (error.code === "INVALID_OPERATIONAL_ROLE") {
      return res.status(400).json({ code: error.code });
    }
    next(error);
  }
};

export const getInvitation = async (req, res, next) => {
  try {
    const { token } = req.body ?? {};
    const invitation = await userService.getInvitationByToken(token);
    if (!invitation) return res.status(400).json({ code: "INVITATION_INVALID" });
    res.json(invitation);
  } catch (error) {
    next(error);
  }
};

export const acceptInvitation = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ code: "BAD_REQUEST", message: "Faltan datos" });
    }

    const input = {
      token,
      password,
    };
    if (req.createUser) input.createUser = req.createUser;
    const result = await userService.acceptRoleInvitation(input);
    res.status(201).json(result);
  } catch (error) {
    if (error.message === "INVITATION_INVALID") return res.status(400).json({ code: "INVITATION_INVALID" });
    next(error);
  }
};

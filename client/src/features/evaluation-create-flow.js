// Match generateCode in the existing events route for the joint rubric/first-item POST.
export function evaluationItemCode(name) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

// Only a received, explicit client rejection proves this attempt was not accepted.
export function unequivocalCreateRejection(error) {
  return [400, 403, 404, 409, 413, 422].includes(error?.status)
    || (error?.status === 401 && error.code === "UNAUTHENTICATED")
    || (error?.status === 429 && error.code === "RATE_LIMIT_EXCEEDED");
}

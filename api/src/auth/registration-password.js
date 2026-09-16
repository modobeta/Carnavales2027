export function requireRegistrationPassword(password) {
  if (typeof password !== "string" || password.length < 8 || password.length > 128
    || !/\p{Lu}/u.test(password) || !/\p{Ll}/u.test(password) || !/[0-9]/.test(password)) {
    throw new TypeError("La contraseña debe tener entre 8 y 128 caracteres, una mayúscula, una minúscula y un número.");
  }
}

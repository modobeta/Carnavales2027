import { useId, useState } from "react";

const requirements = [
  { label: "Una mayúscula", test: /\p{Lu}/u },
  { label: "Una minúscula", test: /\p{Ll}/u },
  { label: "Un número", test: /[0-9]/ },
];

export function isRegistrationPasswordValid(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 128
    && requirements.every(({ test }) => test.test(password));
}

export function RegistrationPasswordFields() {
  const id = useId();
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState({});
  return <>
    {[["password", "Nueva contraseña"], ["passwordConfirmation", "Repetir contraseña"]].map(([name, label]) => (
      <div key={name}>
        <label htmlFor={`${id}-${name}`}>{label}</label>
        <div className="registration-password-field">
          <input id={`${id}-${name}`} name={name} type={visible[name] ? "text" : "password"}
            minLength={8} maxLength={128} autoComplete="new-password" required
            aria-describedby={name === "password" ? `${id}-requirements ${id}-length` : undefined}
            onChange={name === "password" ? (event) => setPassword(event.target.value) : undefined} />
          <button type="button" aria-label={`${visible[name] ? "Ocultar" : "Mostrar"} ${label.toLowerCase()}`}
            aria-pressed={Boolean(visible[name])} aria-controls={`${id}-${name}`}
            onClick={() => setVisible((current) => ({ ...current, [name]: !current[name] }))}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
              {visible[name] && <path d="m3 3 18 18" />}
            </svg>
          </button>
        </div>
        {name === "password" && <>
          <small id={`${id}-length`}>Entre 8 y 128 caracteres.</small>
          <div id={`${id}-requirements`} className="password-requirements" aria-live="polite">
            {requirements.map(({ label: requirement, test }) => {
              const met = test.test(password);
              return <span key={requirement} className={met ? "requirement-met" : "requirement-pending"}>
                {met ? "✓" : "✗"} {requirement}: {met ? "cumplido" : "pendiente"}
              </span>;
            })}
          </div>
        </>}
      </div>
    ))}
  </>;
}

import { useEffect, useState } from "react";
import { TROUPE_LOGO_ACCEPT, validateTroupeLogoFile } from "../api/troupes.js";
import { TroupeLogo } from "../components/TroupeLogo.jsx";

/**
 * TroupeForm — Alta/edición de comparsa (Spec 027/C2, Spec 029 logo).
 *
 * Contrato API de datos: { name, categoryId, brandColor, active }.
 * El color se elige con un selector nativo y se envía como #RRGGBB o null;
 * visible en admin (swatch) y en planilla del jurado (decisión C3: ambos).
 *
 * El logo no viaja en el JSON de la comparsa: el formulario lo expone como
 * `logoFile` o `removeLogo` y el contenedor lo sube/elimina contra
 * `/api/v1/troupes/:id/logo` después de persistir la comparsa.
 */
export function TroupeForm({
  initialValue = {},
  categories = [],
  onSubmit,
  submitting = false,
  submitLabel = "Guardar comparsa",
  showActive = false,
  idPrefix = "troupe",
}) {
  const [fieldError, setFieldError] = useState("");
  const [logoError, setLogoError] = useState("");
  const [logoFile, setLogoFile] = useState(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null);
  const [colorEnabled, setColorEnabled] = useState(Boolean(initialValue.brandColor));
  const [colorValue, setColorValue] = useState(initialValue.brandColor ?? "#3B82F6");

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null);
      return undefined;
    }
    const objectUrl = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [logoFile]);

  const resolveBrandColor = () => {
    if (!colorEnabled) return null;
    if (!/^#[0-9A-Fa-f]{6}$/.test(colorValue)) {
      setFieldError("El color debe tener formato #RRGGBB (por ejemplo #3B82F6).");
      return undefined;
    }
    return colorValue.toLowerCase();
  };

  const handleLogoChange = (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    if (!file) {
      setLogoFile(null);
      setLogoError("");
      return;
    }
    const error = validateTroupeLogoFile(file);
    if (error) {
      setLogoError(error);
      setLogoFile(null);
      input.value = "";
      return;
    }
    setLogoError("");
    setLogoFile(file);
    setRemoveLogo(false);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (logoError) return;
        const formData = new FormData(event.currentTarget);
        const brandColor = resolveBrandColor();
        if (brandColor === undefined) return;
        setFieldError("");
        onSubmit({
          name: formData.get("name"),
          categoryId: formData.get("categoryId"),
          brandColor,
          ...(showActive ? { active: formData.get("active") === "on" } : {}),
          logoFile,
          removeLogo: removeLogo && !logoFile,
        });
      }}
    >
      <label htmlFor={`${idPrefix}-name`}>Nombre</label>
      <input id={`${idPrefix}-name`} name="name" defaultValue={initialValue.name ?? ""} required />
      <label htmlFor={`${idPrefix}-category`}>Tipo de participación</label>
      <select id={`${idPrefix}-category`} name="categoryId" defaultValue={initialValue.categoryId ?? ""} required>
        <option value="">Seleccionar</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <label htmlFor={`${idPrefix}-color`}>Color (opcional)</label>
      <div className="color-field">
        <input
          id={`${idPrefix}-color`}
          name="brandColor"
          type="color"
          value={colorValue}
          disabled={!colorEnabled}
          aria-describedby={`${idPrefix}-color-help`}
          onChange={(event) => setColorValue(event.target.value)}
        />
        <span className="color-value" aria-hidden="true">
          {colorEnabled ? colorValue.toUpperCase() : "Sin color"}
        </span>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={colorEnabled}
          onChange={(event) => setColorEnabled(event.target.checked)}
        />{" "}
        Usar color de identidad
      </label>
      <p id={`${idPrefix}-color-help`} className="help-text">
        El color identifica a la comparsa en la planilla. Sin color se usa el estilo por defecto. Solo vista: no cambia puntajes ni resultados.
      </p>
      <label htmlFor={`${idPrefix}-logo`}>Logo (opcional)</label>
      <input
        id={`${idPrefix}-logo`}
        name="logo"
        type="file"
        accept={TROUPE_LOGO_ACCEPT}
        onChange={handleLogoChange}
        aria-describedby={`${idPrefix}-logo-help`}
      />
      <p id={`${idPrefix}-logo-help`} className="help-text">
        PNG, JPG, WebP o SVG. Máximo 1 MB. Solo vista: no cambia puntajes ni resultados.
      </p>
      {logoPreviewUrl && (
        <img className="troupe-logo-preview" src={logoPreviewUrl} alt="Vista previa del logo" />
      )}
      {!logoPreviewUrl && initialValue.hasLogo && !removeLogo && (
        <div className="troupe-logo-current">
          <TroupeLogo
            troupeId={initialValue.id}
            hasLogo
            sha256={initialValue.logoSha256}
            alt={`Logo actual de ${initialValue.name ?? "la comparsa"}`}
          />
          <button type="button" className="secondary" onClick={() => setRemoveLogo(true)}>
            Quitar logo
          </button>
        </div>
      )}
      {removeLogo && (
        <p className="help-text" role="status">
          El logo se eliminará al guardar.{" "}
          <button type="button" className="secondary" onClick={() => setRemoveLogo(false)}>
            Deshacer
          </button>
        </p>
      )}
      {logoError && <p className="field-error" role="alert">{logoError}</p>}
      {fieldError && <p className="field-error" role="alert">{fieldError}</p>}
      {showActive && (
        <label className="check">
          <input name="active" type="checkbox" defaultChecked={initialValue.active ?? true} /> Activa
        </label>
      )}
      <button type="submit" disabled={submitting}>
        {submitting ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}

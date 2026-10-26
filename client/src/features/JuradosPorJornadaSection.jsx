import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/http.js";
import { Dialog } from "../components/Dialog.jsx";
import { DialogFooter } from "../components/DialogFooter.jsx";
import { StatusPill } from "../components/StatusPill.jsx";
import { SkeletonLoader } from "../components/SkeletonLoader.jsx";

const TYPE_LABELS = {
  PRIMARY: "Titular",
  SUBSTITUTE: "Suplente",
};

const ERROR_MESSAGES = {
  JUDGE_QUOTA_FULL: "El cupo de esa combinación está completo.",
  JUDGE_ALREADY_ASSIGNED: "El jurado ya tiene una asignación activa en esa jornada.",
  EVENT_LOCKED: "El evento ya no permite modificar esta configuración.",
  NIGHT_CLOSED: "La jornada ya está cerrada.",
  JUDGE_NOT_ASSIGNABLE: "El jurado no está registrado o está suspendido.",
  PRIMARY_BALLOT_SUBMITTED: "El titular ya presentó su planilla; no se puede revocar ni reemplazar esta asignación.",
  STANDBY_NOT_FOUND: "Esta asignación no tiene un suplente activo vinculado.",
};

export function JuradosPorJornadaSection({
  event,
  onOpenSpecialties,
  onDataChanged,
  refreshSignal = 0,
}) {
  const [nights, setNights] = useState([]);
  const [selectedNightId, setSelectedNightId] = useState("");
  const [specialties, setSpecialties] = useState([]);
  const [judges, setJudges] = useState([]);
  const [quotas, setQuotas] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingNight, setLoadingNight] = useState(false);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState("");

  // Modal de edición de jurados por especialidad
  const [activeSpecialty, setActiveSpecialty] = useState(null);
  const [subAction, setSubAction] = useState(null); // { type: "replace" | "revoke" | "activate", assignment }
  const [isEditingQuota, setIsEditingQuota] = useState(false);
  const [newQuotaValue, setNewQuotaValue] = useState(1);
  const [modalFeedback, setModalFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  // Formulario de nueva asignación en el modal
  const [newAssignmentType, setNewAssignmentType] = useState("PRIMARY");
  const [selectedJudgeId, setSelectedJudgeId] = useState("");
  const [standbyForId, setStandbyForId] = useState("");

  const modalTriggerRef = useRef(null);

  const canConfigure = event.status === "CONFIGURING";
  const locked = event.status === "OPEN";

  const loadData = async (preserveNightId = "") => {
    try {
      setError(null);
      const [nightsRes, specialtiesRes, judgesRes, assignmentsRes] = await Promise.all([
        apiRequest(`/api/v1/events/${event.id}/nights`),
        apiRequest(`/api/v1/events/${event.id}/specialties`),
        apiRequest("/api/v1/judges"),
        apiRequest(`/api/v1/events/${event.id}/judge-assignments`),
      ]);

      const compNights = (nightsRes ?? []).filter((n) => n.kind === "COMPETITION");
      setNights(compNights);

      const activeSpecs = (specialtiesRes ?? [])
        .filter((s) => s.active !== false)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
      setSpecialties(activeSpecs);

      setJudges((judgesRes ?? []).filter((j) => j.registrationStatus === "REGISTERED"));
      setQuotas(assignmentsRes?.quotas ?? []);
      setAssignments(assignmentsRes?.assignments ?? []);

      setSelectedNightId((current) => {
        const candidate = preserveNightId || current;
        if (candidate && compNights.some((n) => n.id === candidate)) return candidate;
        const openNight = compNights.find((n) => n.status !== "CLOSED");
        return openNight?.id ?? compNights[0]?.id ?? "";
      });
    } catch {
      setError("No se pudieron cargar las asignaciones del evento.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [event.id]);

  // Las especialidades se crean arriba, en este mismo paso: cuando cambian,
  // la tabla de asignaciones debe mostrarlas sin recargar la página.
  const lastRefreshSignal = useRef(refreshSignal);
  useEffect(() => {
    if (lastRefreshSignal.current === refreshSignal) return;
    lastRefreshSignal.current = refreshSignal;
    void loadData(selectedNightId);
  }, [refreshSignal]);

  const handleNightChange = (newNightId) => {
    setLoadingNight(true);
    setSelectedNightId(newNightId);
    setTimeout(() => {
      setLoadingNight(false);
    }, 150);
  };

  const selectedNight = nights.find((n) => n.id === selectedNightId);

  // Funciones auxiliares de correspondencia
  const sameNight = (assignment, night) =>
    night && (assignment.nightId ? assignment.nightId === night.id : assignment.nightName === night.name);

  const sameSpecialty = (assignment, specialty) =>
    specialty && (assignment.specialtyId ? assignment.specialtyId === specialty.id : assignment.specialtyName === specialty.name);

  // Cobertura de una especialidad en la noche seleccionada
  const getSpecialtyCoverage = (spec) => {
    if (!selectedNight) {
      return {
        quota: null,
        maxAssignments: 1,
        activeAssignments: [],
        titulares: [],
        suplentes: [],
        status: "empty",
        message: "Sin asignar · 0 de 1",
        actionLabel: "Asignar jurados",
      };
    }

    const quota = quotas.find((q) => sameNight(q, selectedNight) && sameSpecialty(q, spec));
    const maxAssignments = quota?.maxAssignments ?? 1;

    const activeAssignments = assignments.filter(
      (a) => a.status === "ACTIVE" && sameNight(a, selectedNight) && sameSpecialty(a, spec)
    );

    const titulares = activeAssignments.filter((a) => a.assignmentType === "PRIMARY");
    const suplentes = activeAssignments.filter((a) => a.assignmentType === "SUBSTITUTE");
    const activeAssignmentsCount = activeAssignments.length;

    let status = "empty";
    let message = "";
    let actionLabel = "";

    if (activeAssignmentsCount >= maxAssignments) {
      status = "complete";
      message = `Completa · ${activeAssignmentsCount} de ${maxAssignments}`;
      actionLabel = "Editar asignación";
    } else if (activeAssignmentsCount > 0) {
      status = "partial";
      const diff = maxAssignments - activeAssignmentsCount;
      const assignmentLabel = diff === 1 ? "asignación" : "asignaciones";
      message = `Falta ${diff} ${assignmentLabel} · ${activeAssignmentsCount} de ${maxAssignments}`;
      actionLabel = "Completar asignación";
    } else {
      status = "empty";
      message = `Sin asignar · 0 de ${maxAssignments}`;
      actionLabel = "Asignar jurados";
    }

    return {
      quota,
      maxAssignments,
      activeAssignments,
      titulares,
      suplentes,
      status,
      message,
      actionLabel,
    };
  };

  // Historial de la noche
  const inactiveForNight = assignments.filter(
    (a) => a.status !== "ACTIVE" && sameNight(a, selectedNight)
  );

  // Resumen de la noche
  const pendingSpecialties = specialties.filter((spec) => {
    const cov = getSpecialtyCoverage(spec);
    return cov.status !== "complete";
  });
  const isNightFullyCovered = specialties.length > 0 && pendingSpecialties.length === 0;

  // Apertura del modal para una especialidad
  const openModalForSpecialty = (spec, eventTarget) => {
    modalTriggerRef.current = eventTarget;
    setActiveSpecialty(spec);
    setSubAction(null);
    setIsEditingQuota(false);
    setModalFeedback("");
    setNewAssignmentType("PRIMARY");
    setSelectedJudgeId("");
    setStandbyForId("");

    const cov = getSpecialtyCoverage(spec);
    setNewQuotaValue(cov.maxAssignments);
  };

  const closeModal = () => {
    setActiveSpecialty(null);
    setSubAction(null);
    setIsEditingQuota(false);
    setModalFeedback("");
    modalTriggerRef.current?.focus();
  };

  // Operaciones en la API
  const handleSaveQuota = async (e) => {
    e.preventDefault();
    if (!activeSpecialty || !selectedNight || busy) return;
    setBusy(true);
    setModalFeedback("");
    try {
      await apiRequest(
        `/api/v1/events/${event.id}/nights/${selectedNight.id}/specialties/${activeSpecialty.id}/judge-quota`,
        {
          method: "PUT",
          body: JSON.stringify({ maxAssignments: Number(newQuotaValue) }),
        }
      );
      setModalFeedback("Cupo actualizado.");
      setIsEditingQuota(false);
      await loadData(selectedNightId);
      onDataChanged?.();
    } catch (err) {
      setModalFeedback(ERROR_MESSAGES[err.code] ?? "No se pudo actualizar el cupo.");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    if (!activeSpecialty || !selectedNight || !selectedJudgeId || busy) return;
    setBusy(true);
    setModalFeedback("");
    try {
      const res = await apiRequest(`/api/v1/events/${event.id}/judge-assignments`, {
        method: "POST",
        body: JSON.stringify({
          nightId: selectedNight.id,
          specialtyId: activeSpecialty.id,
          judgeProfileId: selectedJudgeId,
          assignmentType: newAssignmentType,
          standbyForAssignmentId: newAssignmentType === "SUBSTITUTE" ? (standbyForId || undefined) : undefined,
        }),
      });
      setSelectedJudgeId("");
      setStandbyForId("");
      setModalFeedback(
        res?.ballotsCreated > 0
          ? "Asignación creada; la planilla del jurado ya está disponible."
          : "Asignación creada con éxito."
      );
      await loadData(selectedNightId);
      onDataChanged?.();
    } catch (err) {
      setModalFeedback(ERROR_MESSAGES[err.code] ?? "No se pudo crear la asignación.");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitSubAction = async (e) => {
    e.preventDefault();
    if (!subAction || busy) return;
    const { type, assignment } = subAction;
    const formData = new FormData(e.currentTarget);
    const reason = formData.get("reason");
    setBusy(true);
    setModalFeedback("");
    try {
      if (type === "revoke") {
        await apiRequest(`/api/v1/judge-assignments/${assignment.id}/revoke`, {
          method: "POST",
          body: JSON.stringify({ reason }),
        });
        setModalFeedback("Asignación revocada.");
      } else if (type === "replace") {
        const replacementJudgeProfileId = formData.get("replacementJudgeProfileId");
        const res = await apiRequest(`/api/v1/judge-assignments/${assignment.id}/replace`, {
          method: "POST",
          body: JSON.stringify({ replacementJudgeProfileId, assignmentType: "PRIMARY", reason }),
        });
        setModalFeedback(
          res?.ballotsCreated > 0
            ? "Asignación reemplazada; la planilla del nuevo jurado ya está disponible."
            : "Asignación reemplazada con éxito."
        );
      } else if (type === "activate") {
        await apiRequest(`/api/v1/judge-assignments/${assignment.id}/activate-substitute`, {
          method: "POST",
          body: JSON.stringify({ reason }),
        });
        setModalFeedback("Suplente activado; su planilla ya está disponible.");
      }
      setSubAction(null);
      await loadData(selectedNightId);
      onDataChanged?.();
    } catch (err) {
      setModalFeedback(ERROR_MESSAGES[err.code] ?? "No se pudo completar la operación.");
    } finally {
      setBusy(false);
    }
  };

  // Jurados ya asignados activamente en esta noche
  const assignedJudgeIdsInNight = new Set(
    assignments
      .filter((a) => a.status === "ACTIVE" && sameNight(a, selectedNight))
      .map((a) => a.judgeProfileId)
  );

  const assignableJudges = judges.filter((j) => !assignedJudgeIdsInNight.has(j.id));

  // Titulares disponibles para vincular un suplente
  const activeCov = activeSpecialty ? getSpecialtyCoverage(activeSpecialty) : null;
  const primaryOptions = activeCov
    ? activeCov.titulares.filter(
        (titular) => !activeCov.suplentes.some((s) => s.standbyForAssignmentId === titular.id)
      )
    : [];

  // Error de carga
  if (!loading && error) {
    return (
      <div className="competencia-callout is-warning" role="alert" style={{ margin: "var(--space-4) 0" }}>
        <span>{error}</span>
        <button type="button" className="secondary" onClick={() => loadData(selectedNightId)}>
          Reintentar
        </button>
      </div>
    );
  }

  // Vista cuando no hay jornadas o especialidades
  if (!loading && nights.length === 0) {
    return (
      <div className="empty-state" style={{ padding: "var(--space-6)" }}>
        <p>No hay jornadas de competencia configuradas.</p>
        <p>
          Configurá las jornadas en <a href="#/admin/events">Eventos y jornadas</a>.
        </p>
      </div>
    );
  }

  if (!loading && specialties.length === 0) {
    return (
      <div className="empty-state" style={{ padding: "var(--space-6)" }}>
        <p>No hay especialidades configuradas para este evento.</p>
        <button type="button" className="btn-primary" onClick={onOpenSpecialties}>
          + Crear especialidad
        </button>
      </div>
    );
  }

  return (
    <div className="jurados-por-jornada-flow">
      {error && (
        <div className="competencia-callout is-warning" role="alert">
          <span>{error}</span>
          <button type="button" className="secondary" onClick={() => loadData(selectedNightId)}>
            Reintentar
          </button>
        </div>
      )}

      {/* Encabezado del paso */}
      <div className="competencia-step-header-row">
        <h2>Jurados por jornada</h2>
      </div>

      {/* Selector de jornada */}
      <div className="competencia-night-select-bar">
        <label htmlFor="select-jornada-jurados">Jornada</label>
        <select
          id="select-jornada-jurados"
          value={selectedNightId}
          onChange={(e) => handleNightChange(e.target.value)}
          disabled={loadingNight || loading}
          aria-label="Seleccionar jornada"
        >
          {nights.map((night) => (
            <option key={night.id} value={night.id}>
              {night.name}
            </option>
          ))}
        </select>
      </div>

      {feedback && <p className="feedback" role="status">{feedback}</p>}

      {/* Tabla de asignaciones de jurados */}
      <div className="competencia-card">
        <div className="competencia-card-toolbar">
          <h3 style={{ margin: 0, fontSize: "var(--text-lg)" }}>Asignaciones de jurados</h3>
        </div>

        {loadingNight ? (
          <SkeletonLoader variant="table" rows={3} label="Cargando asignaciones de la jornada…" />
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Especialidad</th>
                  <th scope="col">Jurados asignados</th>
                  <th scope="col">Puestos cubiertos</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {specialties.map((spec) => {
                  const cov = getSpecialtyCoverage(spec);
                  return (
                    <tr key={spec.id}>
                      <td>
                        <strong>{spec.name}</strong>
                      </td>
                      <td>
                        {cov.activeAssignments.length === 0 ? (
                          <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                            Sin jurados asignados
                          </span>
                        ) : (
                          <ul className="assigned-judges-list">
                            {cov.activeAssignments.map((a) => {
                              const standby = cov.suplentes.find(
                                (s) => s.standbyForAssignmentId === a.id
                              );
                              return (
                                <li key={a.id} className="assigned-judge-item">
                                  <span className="judge-name">{a.judgeName}</span>
                                  <span className="judge-role-tag">
                                    {TYPE_LABELS[a.assignmentType] ?? a.assignmentType}
                                  </span>
                                  {standby && (
                                    <small style={{ color: "var(--text-secondary)", marginInlineStart: "var(--space-1)" }}>
                                      (Suplente: {standby.judgeName})
                                    </small>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </td>
                      <td>
                        <span className={`coverage-pill is-${cov.status}`}>
                          {cov.status === "complete" ? "✓ " : cov.status === "partial" ? "⚠ " : "● "}
                          {cov.message}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={cov.status === "complete" ? "secondary" : "primary"}
                          aria-label={`${cov.actionLabel} ${spec.name}`}
                          onClick={(e) => openModalForSpecialty(spec, e.currentTarget)}
                        >
                          {cov.status === "complete" ? "✏ " : ""}
                          {cov.actionLabel}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Historial desplegable de la jornada */}
        <details className="competencia-history-details">
          <summary>Ver historial de esta jornada ({inactiveForNight.length})</summary>
          {inactiveForNight.length === 0 ? (
            <p style={{ margin: "var(--space-2) 0", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
              No hay asignaciones revocadas o reemplazadas en esta jornada.
            </p>
          ) : (
            <ul className="competencia-history-list">
              {inactiveForNight.map((assignment) => (
                <li key={assignment.id} className="competencia-history-item">
                  <div>
                    <strong>{assignment.judgeName}</strong> · {assignment.specialtyName} (
                    {TYPE_LABELS[assignment.assignmentType] ?? assignment.assignmentType})
                    {assignment.reason && (
                      <p style={{ margin: "var(--space-1) 0 0", color: "var(--text-secondary)", fontSize: "var(--text-xs)" }}>
                        Motivo: {assignment.reason}
                      </p>
                    )}
                  </div>
                  <StatusPill
                    status={assignment.status}
                    label={assignment.status === "REPLACED" ? "Reemplazada" : "Revocada"}
                  />
                </li>
              ))}
            </ul>
          )}
        </details>
      </div>

      {/* Resumen de cobertura de la jornada */}
      {isNightFullyCovered ? (
        <div className="competencia-callout is-success" role="status">
          <span className="callout-icon" aria-hidden="true">✓</span>
          <span>Todas las especialidades de esta jornada tienen sus puestos cubiertos.</span>
        </div>
      ) : (
        <div className="competencia-callout is-warning" role="status">
          <span className="callout-icon" aria-hidden="true">⚠</span>
          <span>
            Falta completar la asignación de jurados en {pendingSpecialties.length} especialidad
            {pendingSpecialties.length > 1 ? "es" : ""}.
          </span>
        </div>
      )}

      {/* Diálogo "Jurados de [especialidad] — [jornada]" */}
      <Dialog
        isOpen={activeSpecialty !== null}
        onClose={closeModal}
        title={activeSpecialty && selectedNight ? `Jurados de ${activeSpecialty.name} — ${selectedNight.name}` : "Jurados"}
        description="Asigná quién evalúa esta especialidad en esta jornada y gestioná cupos y reemplazos."
        focusReturnRef={modalTriggerRef}
      >
        {activeSpecialty && selectedNight && activeCov && (
          <div className="assignment-dialog-body">
            {modalFeedback && (
              <p className="feedback" role="status" aria-live="polite">
                {modalFeedback}
              </p>
            )}

            {/* Bloque de Cupo */}
            <div className="assignment-quota-box">
              <div>
                <strong>Cupo de asignaciones (titulares y suplentes):</strong> {activeCov.maxAssignments} puesto(s)
              </div>
              {canConfigure && !isEditingQuota && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setIsEditingQuota(true)}
                  disabled={busy}
                >
                  Editar cupo
                </button>
              )}
            </div>

            {/* Formulario para editar cupo */}
            {isEditingQuota && (
              <form onSubmit={handleSaveQuota} style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
                <label>
                  Cupo máximo
                  <input
                    type="number"
                    min="1"
                    value={newQuotaValue}
                    onChange={(e) => setNewQuotaValue(e.target.value)}
                    required
                    disabled={busy}
                  />
                </label>
                <button type="submit" disabled={busy}>
                  Guardar cupo
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setIsEditingQuota(false)}
                  disabled={busy}
                >
                  Cancelar
                </button>
              </form>
            )}

            {/* Sub-formulario de acción: Revocar, Reemplazar, Activar suplente */}
            {subAction && (
              <div style={{ padding: "var(--space-3)", background: "var(--surface-input)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)" }}>
                <h4 style={{ margin: "0 0 var(--space-2)" }}>
                  {subAction.type === "revoke"
                    ? `Quitar asignación de ${subAction.assignment.judgeName}`
                    : subAction.type === "replace"
                    ? `Reemplazar a ${subAction.assignment.judgeName}`
                    : `Activar suplente de ${subAction.assignment.judgeName}`}
                </h4>
                {subAction.type === "revoke" && (
                  <p style={{ margin: "0 0 var(--space-2)", color: "var(--warning-text)", fontSize: "var(--text-xs)" }}>
                    Al quitar la asignación, se retira al jurado de esta especialidad y jornada; no elimina su usuario del padrón.
                  </p>
                )}
                <form onSubmit={handleSubmitSubAction}>
                  {subAction.type === "replace" && (
                    <label>
                      Nuevo jurado
                      <select name="replacementJudgeProfileId" required defaultValue="">
                        <option value="">Elegir jurado de reemplazo</option>
                        {assignableJudges.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    Motivo
                    <input
                      name="reason"
                      placeholder="Ingresá el motivo de esta acción..."
                      required
                      disabled={busy}
                    />
                  </label>
                  <p style={{ margin: "var(--space-1) 0 var(--space-3)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                    Esta acción quedará registrada en el historial.
                  </p>
                  <DialogFooter>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setSubAction(null)}
                      disabled={busy}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className={subAction.type === "revoke" ? "danger-action" : "primary"}
                      disabled={busy}
                    >
                      {subAction.type === "revoke"
                        ? "Confirmar y quitar"
                        : subAction.type === "replace"
                        ? "Confirmar reemplazo"
                        : "Confirmar activación"}
                    </button>
                  </DialogFooter>
                </form>
              </div>
            )}

            {/* Lista de Jurados Actuales */}
            <div>
              <h4 style={{ margin: "0 0 var(--space-2)" }}>Jurados actualmente asignados</h4>
              {activeCov.activeAssignments.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: "var(--text-sm)" }}>
                  No hay jurados asignados para esta especialidad.
                </p>
              ) : (
                <div className="assignment-current-judges">
                  {activeCov.activeAssignments.map((assignment) => {
                    const isSubstitute = assignment.assignmentType === "SUBSTITUTE";
                    const standby = activeCov.suplentes.find(
                      (s) => s.standbyForAssignmentId === assignment.id
                    );

                    return (
                      <div key={assignment.id} className="assignment-judge-card">
                        <div>
                          <strong>{assignment.judgeName}</strong>
                          <span className="judge-role-tag" style={{ marginInlineStart: "var(--space-2)" }}>
                            {TYPE_LABELS[assignment.assignmentType]}
                          </span>
                          {isSubstitute && (
                            <p style={{ margin: "var(--space-1) 0 0", color: "var(--text-secondary)", fontSize: "var(--text-xs)" }}>
                              Cubre al titular asignado.
                            </p>
                          )}
                          {standby && (
                            <p style={{ margin: "var(--space-1) 0 0", color: "var(--text-secondary)", fontSize: "var(--text-xs)" }}>
                              Suplente vinculado: <strong>{standby.judgeName}</strong>
                            </p>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                          {standby && !subAction && (
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => setSubAction({ type: "activate", assignment })}
                              disabled={busy || selectedNight.status === "CLOSED"}
                            >
                              Activar suplente
                            </button>
                          )}
                          {!subAction && (
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => setSubAction({ type: "replace", assignment })}
                              disabled={busy || selectedNight.status === "CLOSED"}
                            >
                              Reemplazar
                            </button>
                          )}
                          {!subAction && (
                            <button
                              type="button"
                              className="secondary danger-action"
                              onClick={() => setSubAction({ type: "revoke", assignment })}
                              disabled={busy || selectedNight.status === "CLOSED"}
                            >
                              Quitar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Formulario de Nueva Asignación */}
            {!subAction && (
              <form onSubmit={handleCreateAssignment} style={{ borderBlockStart: "1px solid var(--border-default)", paddingBlockStart: "var(--space-3)" }}>
                <h4 style={{ margin: "0 0 var(--space-2)" }}>+ Asignar jurado</h4>

                {/* Tipo de asignación: Titular o Suplente */}
                <div style={{ display: "flex", gap: "var(--space-4)", marginBlockEnd: "var(--space-3)" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="assignmentType"
                      value="PRIMARY"
                      checked={newAssignmentType === "PRIMARY"}
                      onChange={() => setNewAssignmentType("PRIMARY")}
                    />
                    Titular
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="assignmentType"
                      value="SUBSTITUTE"
                      checked={newAssignmentType === "SUBSTITUTE"}
                      onChange={() => setNewAssignmentType("SUBSTITUTE")}
                    />
                    Suplente
                  </label>
                </div>

                {/* Si es suplente, vincular a titular */}
                {newAssignmentType === "SUBSTITUTE" && (
                  <div style={{ marginBlockEnd: "var(--space-3)" }}>
                    <label>
                      Suplente de:
                      <select
                        value={standbyForId}
                        onChange={(e) => setStandbyForId(e.target.value)}
                        required
                      >
                        <option value="">Seleccionar titular</option>
                        {primaryOptions.map((titular) => (
                          <option key={titular.id} value={titular.id}>
                            {titular.judgeName}
                          </option>
                        ))}
                      </select>
                    </label>
                    {primaryOptions.length === 0 && (
                      <p style={{ color: "var(--warning-text)", fontSize: "var(--text-xs)", margin: "var(--space-1) 0 0" }}>
                        No hay titulares sin suplente disponibles en esta especialidad.
                      </p>
                    )}
                  </div>
                )}

                {/* Selección de Jurado */}
                <div style={{ marginBlockEnd: "var(--space-3)" }}>
                  <label>
                    Jurado disponible
                    <select
                      value={selectedJudgeId}
                      onChange={(e) => setSelectedJudgeId(e.target.value)}
                      required
                      disabled={assignableJudges.length === 0}
                    >
                      <option value="">Seleccionar del padrón</option>
                      {assignableJudges.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {assignableJudges.length === 0 && (
                    <p style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)", margin: "var(--space-1) 0 0" }}>
                      {judges.length === 0
                        ? "No hay jurados registrados en el sistema."
                        : "Todos los jurados registrados ya tienen una asignación activa en esta jornada."}{" "}
                      Gestioná el padrón en <a href="#/admin/judges">Jurados</a>.
                    </p>
                  )}
                </div>

                <DialogFooter>
                  <button type="button" className="secondary" onClick={closeModal} disabled={busy}>
                    Cerrar
                  </button>
                  <button
                    type="submit"
                    className="primary"
                    disabled={
                      busy ||
                      !selectedJudgeId ||
                      (newAssignmentType === "SUBSTITUTE" && primaryOptions.length === 0)
                    }
                  >
                    Asignar jurado
                  </button>
                </DialogFooter>
              </form>
            )}

            {subAction && (
              <DialogFooter>
                <button type="button" className="secondary" onClick={closeModal} disabled={busy}>
                  Cerrar
                </button>
              </DialogFooter>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}

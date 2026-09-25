import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { apiRequest } from "../api/http.js";
import { Dialog } from "../components/Dialog.jsx";
import { DialogFooter } from "../components/DialogFooter.jsx";
import { PageShell } from "../components/PageShell.jsx";
import { Button } from "../components/Button.jsx";
import { ProgressBar } from "../components/ProgressBar.jsx";
import { StatusPill } from "../components/StatusPill.jsx";
import { useAdminEvent } from "../context/AdminEventContext.jsx";
import { isSessionEndedError, redirectToLoginExpired, useSession } from "../auth/session-context.jsx";

function groupScores(scores) {
  return scores.reduce((groups, score) => {
    const key = score.nightScheduleId;
    if (!groups[key]) {
      groups[key] = {
        nightScheduleId: key,
        troupeName: score.troupeName,
        presentationOrder: score.presentationOrder ?? 0,
        brandColor: score.brandColor || null,
        rubrics: {},
      };
    }
    if (!groups[key].rubrics[score.rubricId]) {
      groups[key].rubrics[score.rubricId] = {
        rubricId: score.rubricId,
        rubricName: score.rubricName,
        scores: [],
      };
    }
    groups[key].rubrics[score.rubricId].scores.push(score);
    return groups;
  }, {});
}

const SUBJECT_LABELS = { PERSON: "Persona o bailarín", COUPLE: "Pareja", GROUP: "Grupo", FIGURE: "Figura", ELEMENT: "Elemento", OTHER: "Otro sujeto" };

function getPendingItems(scores, details) {
  const scoresById = new Map(scores.map((score) => [score.id, score]));
  const source = details?.length > 0
    ? details
    : scores.filter((score) => score.evaluationState === "PENDING");

  return source.map((item, index) => {
    const score = scoresById.get(item.id) ?? item;
    return {
      id: item.id ?? score.id ?? `pending-${index}`,
      troupeName: score.troupeName ?? item.troupeName ?? "Comparsa sin identificar",
      rubricName: score.rubricName ?? item.rubricName ?? "Rubro sin identificar",
      itemName: score.itemName ?? item.name ?? item.itemName ?? item.code ?? "Ítem pendiente",
    };
  });
}

export function JudgeBallotPage({ ballotId, troupeId: initialTroupeId }) {
  const eventContext = useAdminEvent();
  const session = useSession();
  const syncedBallotRef = useRef(null);
  // Si la sesión venció a mitad de la votación, volver al login con aviso y
  // retomar aquí tras re-autenticar (los votos confirmados están en servidor).
  const redirectOnSessionEnded = (error) => {
    if (!isSessionEndedError(error)) return false;
    session.clear?.({ sessionExpired: true });
    const troupePart = selectedTroupeId ? `&troupeId=${encodeURIComponent(selectedTroupeId)}` : "";
    redirectToLoginExpired(`#/judge/ballot?ballotId=${ballotId}${troupePart}`);
    return true;
  };
  const [ballot, setBallot] = useState(null);
  const [selectedTroupeId, setSelectedTroupeId] = useState(initialTroupeId || "");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [scoreConfirm, setScoreConfirm] = useState(null); // { scoreId, score, troupeName, rubricName, itemName } — Spec 007 RF-77
  const [itemStatuses, setItemStatuses] = useState({}); // { [id]: { status: 'idle'|'saving'|'saved'|'error', errorMsg, lastAttempt } }
  const [notPresentedConfirm, setNotPresentedConfirm] = useState(null); // score item
  const [troupeAbsentConfirm, setTroupeAbsentConfirm] = useState(null); // { nightScheduleId, troupeName, pendingCount }
  const [markingAbsent, setMarkingAbsent] = useState(false);
  const [pendingDialogOpen, setPendingDialogOpen] = useState(false);
  const [incompleteDialog, setIncompleteDialog] = useState(null);
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [continuityPrompt, setContinuityPrompt] = useState(null); // { completedTroupeName, nextTroupeName, nextNightScheduleId }
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [showAllReadonlyGroups, setShowAllReadonlyGroups] = useState(false);
  const [readonlyTroupeFilter, setReadonlyTroupeFilter] = useState("");
  const [readonlyRubricFilter, setReadonlyRubricFilter] = useState("");

  const cardSectionRef = useRef(null);
  const submitButtonRef = useRef(null);
  const mountedRef = useRef(true);
  const lastTroupeRef = useRef(null);
  const readonlyGroupRefs = useRef(new Map());

  useEffect(() => {
    if (!eventContext || !ballot || ballot.id !== ballotId || syncedBallotRef.current === ballot.id) return;
    if (eventContext.events.some((event) => event.id === ballot.eventId)) {
      syncedBallotRef.current = ballot.id;
      eventContext.setActiveEventId(ballot.eventId);
    }
  }, [ballot, ballotId, eventContext]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (initialTroupeId) {
      setSelectedTroupeId(initialTroupeId);
    }
  }, [initialTroupeId]);

  const loadBallot = async () => {
    if (!ballotId) return;
    try {
      const loaded = await apiRequest(`/api/v1/judge/ballots/${ballotId}`);
      if (!mountedRef.current) return;
      setBallot(loaded);
    } catch (error) {
      if (!mountedRef.current) return;
      if (redirectOnSessionEnded(error)) return;
      const messages = {
        BALLOT_ACCESS_DENIED: "No tenés acceso a esta planilla.",
        BALLOT_NOT_FOUND: "La planilla no existe.",
      };
      setMessage(messages[error.code] ?? "No se pudo cargar la planilla.");
    }
  };

  useEffect(() => {
    void loadBallot();
  }, [ballotId]);

  useEffect(() => {
    if (!ballot || !selectedTroupeId) return;
    // Solo reubicar el índice al CAMBIAR de comparsa, no en cada refresco del
    // ballot tras confirmar un voto (evita volver a la primera tarjeta en modo card).
    if (lastTroupeRef.current === selectedTroupeId) return;
    lastTroupeRef.current = selectedTroupeId;
    // Entrar directo al primer ítem PENDIENTE de la comparsa elegida, no al
    // primero histórico (evita recorrer notas ya confirmadas/inmutables).
    const troupeKey = String(selectedTroupeId);
    const troupeIndices = ballot.scores
      .map((s, idx) => ({ s, idx }))
      .filter(({ s }) => String(s.nightScheduleId) === troupeKey)
      .map(({ idx }) => idx);
    const firstPendingIdx = troupeIndices.find((idx) => ballot.scores[idx]?.evaluationState === "PENDING");
    const targetIdx = firstPendingIdx ?? troupeIndices[0];
    if (targetIdx !== undefined && targetIdx !== -1) {
      setActiveItemIndex(targetIdx);
    }
    requestAnimationFrame(() => {
      cardSectionRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
  }, [ballot, selectedTroupeId]);

  // En planilla confirmada: posicionar la vista en la sección de la comparsa
  // seleccionada con "Ver planilla" (scroll + resaltado, manteniendo todas visibles).
  useEffect(() => {
    if (!ballot || ballot.status !== "SUBMITTED" || !selectedTroupeId) return;
    const key = String(selectedTroupeId);
    const t = setTimeout(() => {
      readonlyGroupRefs.current.get(key)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }, 60);
    return () => clearTimeout(t);
  }, [ballot, selectedTroupeId]);

  // Tarjetas de comparsa desplegables: por defecto solo la seleccionada
  // (o la primera) abierta para reducir ruido; el resto colapsado.
  const [expandedGroups, setExpandedGroups] = useState(null);
  const defaultExpandedGroups = (list, selected) => new Set(
    list
      .filter((g, i) => (selected ? String(g.nightScheduleId) === String(selected.nightScheduleId) : i === 0))
      .map((g) => String(g.nightScheduleId))
  );
  const isGroupOpen = (group, isSelected, isFirst) => {
    if (expandedGroups !== null) return expandedGroups.has(String(group.nightScheduleId));
    if (targetGroup) return isSelected;
    return isFirst;
  };
  const toggleReadonlyGroup = (group) => {
    const key = String(group.nightScheduleId);
    setExpandedGroups((prev) => {
      const base = prev ?? defaultExpandedGroups(groups, targetGroup);
      const next = new Set(base);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const goToReadonlyGroup = (group) => {
    const key = String(group.nightScheduleId);
    setExpandedGroups((prev) => {
      const next = new Set(prev ?? defaultExpandedGroups(groups, targetGroup));
      next.add(key);
      return next;
    });
    setTimeout(() => {
      readonlyGroupRefs.current.get(key)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const readonly = ballot?.status === "SUBMITTED";
  const groups = ballot ? Object.values(groupScores(ballot.scores)).sort((left, right) => left.presentationOrder - right.presentationOrder) : [];
  const activeGroup = ballot && !readonly
    ? groups.find((group) => {
        const allScores = Object.values(group.rubrics).flatMap((r) => r.scores);
        return allScores.some((s) => s.evaluationState === "PENDING");
      })
    : null;

  const targetGroup = ballot && selectedTroupeId
    ? groups.find((g) => g.nightScheduleId === selectedTroupeId || String(g.nightScheduleId) === String(selectedTroupeId))
    : null;

  const isTargetTroupeLocked = Boolean(
    !readonly &&
    targetGroup &&
    activeGroup &&
    targetGroup.presentationOrder > activeGroup.presentationOrder
  );

  const saveDecision = async (scoreId, evaluationState, score) => {
    if (!ballot) return;
    setItemStatuses((prev) => ({
      ...prev,
      [scoreId]: { status: "saving", lastAttempt: { evaluationState, score } },
    }));
    try {
      const saved = await apiRequest(`/api/v1/judge/ballots/${ballotId}/scores/${scoreId}`, {
        method: "PUT",
        body: JSON.stringify({ evaluationState, score }),
      });
      if (!mountedRef.current) return;
      setBallot((current) => current && {
        ...current,
        revision: saved.revision,
        scores: current.scores.map((item) => (item.id === scoreId ? { ...item, ...saved } : item)),
      });
      setItemStatuses((prev) => ({
        ...prev,
        [scoreId]: { status: "saved" },
      }));
      setMessage("Decisión confirmada en el servidor.");

      // Check if this save completed the troupe (RF-192)
      const currentScore = ballot.scores.find((s) => s.id === scoreId);
      if (currentScore) {
        const troupeScores = ballot.scores.filter((s) => s.nightScheduleId === currentScore.nightScheduleId);
        const remainingAfterSave = troupeScores.filter((s) => s.id !== scoreId && s.evaluationState === "PENDING").length;
        if (remainingAfterSave === 0) {
          const currentGroupIdx = groups.findIndex((g) => g.nightScheduleId === currentScore.nightScheduleId);
          if (currentGroupIdx !== -1 && currentGroupIdx < groups.length - 1) {
            const nextGroup = groups[currentGroupIdx + 1];
            setContinuityPrompt({
              completedTroupeName: currentScore.troupeName,
              nextTroupeName: nextGroup.troupeName,
              nextNightScheduleId: nextGroup.nightScheduleId,
            });
          }
        }
      }
    } catch (error) {
      if (!mountedRef.current) return;
      if (redirectOnSessionEnded(error)) return;
      const errorMsg = error.code === "NETWORK_ERROR"
        ? "No hay conexión. Volvé a intentarlo para registrar la decisión."
        : "El servidor no pudo registrar la decisión.";
      setItemStatuses((prev) => ({
        ...prev,
        [scoreId]: { status: "error", errorMsg, lastAttempt: { evaluationState, score } },
      }));
      setMessage(errorMsg);
    }
  };

  const handleScoreClick = (scoreItem, value, troupeName, rubricName) => {
    // Spec 007 RF-77: cada tap en 1-10 abre modal de confirmación, sin preselección in situ
    setScoreConfirm({
      scoreId: scoreItem.id,
      score: value,
      troupeName: troupeName ?? scoreItem.troupeName ?? "",
      rubricName: rubricName ?? scoreItem.rubricName ?? "",
      itemName: scoreItem.itemName ?? "",
    });
  };

  const handleRetry = (scoreId) => {
    const itemState = itemStatuses[scoreId];
    if (itemState?.lastAttempt) {
      void saveDecision(scoreId, itemState.lastAttempt.evaluationState, itemState.lastAttempt.score);
    }
  };

  const markTroupeAbsent = async (nightScheduleId) => {
    if (!ballot || markingAbsent) return;
    setMarkingAbsent(true);
    setMessage("");
    try {
      const result = await apiRequest(`/api/v1/judge/ballots/${ballotId}/troupes/${nightScheduleId}/mark-absent`, { method: "POST" });
      if (!mountedRef.current) return;
      setBallot((current) => current && {
        ...current,
        revision: result.revision,
        scores: current.scores.map((item) =>
          item.nightScheduleId === nightScheduleId && item.evaluationState === "PENDING"
            ? { ...item, evaluationState: "NOT_PRESENTED", score: 0 }
            : item
        ),
      });
      setMessage("Comparsa marcada como no presentada.");
      const currentGroupIdx = groups.findIndex((g) => String(g.nightScheduleId) === String(nightScheduleId));
      if (currentGroupIdx !== -1 && currentGroupIdx < groups.length - 1) {
        const nextGroup = groups[currentGroupIdx + 1];
        setContinuityPrompt({
          completedTroupeName: groups[currentGroupIdx].troupeName,
          nextTroupeName: nextGroup.troupeName,
          nextNightScheduleId: nextGroup.nightScheduleId,
        });
      }
    } catch (error) {
      if (!mountedRef.current) return;
      if (redirectOnSessionEnded(error)) return;
      if (error.code === "TROUPE_PRECEDENCE_REQUIRED") {
        setMessage("Primero debés resolver la comparsa anterior.");
      } else {
        setMessage(error.code === "NETWORK_ERROR"
          ? "No hay conexión. Volvé a intentarlo para marcar la comparsa."
          : "No se pudo marcar la comparsa.");
      }
    } finally {
      if (mountedRef.current) setMarkingAbsent(false);
    }
  };

  const submit = async () => {
    if (!ballot || isSubmitting) return;
    setMessage("");
    const pendingItems = getPendingItems(ballot.scores);
    if (pendingItems.length > 0) {
      setIncompleteDialog(pendingItems);
      return;
    }
    setIsSubmitting(true);
    try {
      const submitted = await apiRequest(`/api/v1/judge/ballots/${ballotId}/submit`, { method: "POST" });
      if (!mountedRef.current) return;
      setBallot((current) => current && {
        ...current,
        status: submitted.status,
        revision: submitted.revision,
        scores: current.scores.map((score) => ({ ...score, status: "LOCKED" })),
      });
      setMessage("Planilla confirmada en el servidor.");
    } catch (error) {
      if (!mountedRef.current) return;
      if (redirectOnSessionEnded(error)) {
        if (mountedRef.current) setIsSubmitting(false);
        return;
      }
      if (error.code === "BALLOT_INCOMPLETE") {
        setIncompleteDialog(getPendingItems(ballot.scores, error.details));
      } else {
        setMessage(error.code === "NETWORK_ERROR"
          ? "No hay conexión. Volvé a intentarlo para confirmar la planilla."
          : "No se pudo confirmar la planilla.");
      }
    } finally {
      if (mountedRef.current) setIsSubmitting(false);
    }
  };

  // Keyboard navigation for desktop (RF-189): digits open Spec 007 modal, no staged state
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        notPresentedConfirm ||
        troupeAbsentConfirm ||
        scoreConfirm ||
        pendingDialogOpen ||
        incompleteDialog ||
        submitConfirm ||
        !ballot
      ) {
        return;
      }
      const activeScore = ballot.scores[activeItemIndex];
      if (!activeScore || activeScore.evaluationState !== "PENDING" || ballot.status === "SUBMITTED") return;

      if (e.key >= "1" && e.key <= "9") {
        const val = Number(e.key);
        setScoreConfirm({
          scoreId: activeScore.id,
          score: val,
          troupeName: activeScore.troupeName ?? "",
          rubricName: activeScore.rubricName ?? "",
          itemName: activeScore.itemName ?? "",
        });
      } else if (e.key === "0") {
        setScoreConfirm({
          scoreId: activeScore.id,
          score: 10,
          troupeName: activeScore.troupeName ?? "",
          rubricName: activeScore.rubricName ?? "",
          itemName: activeScore.itemName ?? "",
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [ballot, activeItemIndex, scoreConfirm, notPresentedConfirm, troupeAbsentConfirm, pendingDialogOpen, incompleteDialog, submitConfirm]);

  if (!ballotId) {
    return (
      <PageShell layer="instrument" className="container">
        <div className="card">
          <h1>Planilla no seleccionada</h1>
          <a href="#/judge">Volver a mi panel</a>
        </div>
      </PageShell>
    );
  }

  if (!ballot) {
    return (
      <PageShell layer="instrument" className="container">
        <div className="card">
          <h1>Planilla de evaluación</h1>
          <p role="status">{message || "Cargando planilla…"}</p>
        </div>
      </PageShell>
    );
  }

  if (isTargetTroupeLocked) {
    return (
      <PageShell layer="instrument" className="container judge-ballot-guard judge-operation-shell">
        <div className="card guard-card">
          <span className="guard-icon" aria-hidden="true">🔒</span>
          <p className="eyebrow">
            Salida {targetGroup.presentationOrder} · {targetGroup.troupeName}
          </p>
          <h1>Comparsa en espera de pasada</h1>
          <p className="guard-description">
            Debes calificar y confirmar los rubros de <strong>{activeGroup.troupeName}</strong> antes de acceder a esta planilla.
          </p>
          <div className="guard-actions">
            <a
              className="button button-primary button-link"
              href={`#/judge/ballot?ballotId=${ballotId}&troupeId=${encodeURIComponent(activeGroup.nightScheduleId)}`}
              onClick={() => {
                setSelectedTroupeId(activeGroup.nightScheduleId);
              }}
            >
              Ir a comparsa actual →
            </a>
            <a className="button button-secondary button-link" href="#/judge">
              ← Volver a mis comparsas
            </a>
          </div>
        </div>
      </PageShell>
    );
  }

  const resolved = ballot.scores.filter((score) => score.evaluationState !== "PENDING").length;
  const total = ballot.scores.length;
  const progress = total > 0 ? Math.round((resolved / total) * 100) : 0;
  const scoreTotal = ballot.scores.reduce((sum, score) => sum + (typeof score.score === "number" ? score.score : 0), 0);
  const pendingScores = ballot.scores.filter((score) => score.evaluationState === "PENDING");
  const effectiveIndex = Math.min(Math.max(0, activeItemIndex), Math.max(0, total - 1));
  const previousPendingScores = ballot.scores.slice(0, effectiveIndex).filter((score) => score.evaluationState === "PENDING");
  const activeScore = ballot.scores[effectiveIndex];
  const troupeScores = activeScore ? ballot.scores.filter((score) => score.nightScheduleId === activeScore.nightScheduleId) : [];
  const troupeResolved = troupeScores.filter((score) => score.evaluationState !== "PENDING").length;
  const troupeProgress = troupeScores.length ? Math.round(troupeResolved / troupeScores.length * 100) : 0;
  const activeTroupePending = troupeScores.filter((score) => score.evaluationState === "PENDING").length;
  const canConfirmVoting = total > 0 && resolved === total && !isSubmitting
    && !Object.values(itemStatuses).some((item) => item.status === "saving");

  const beginSubmitReview = () => {
    if (!canConfirmVoting || readonly) return;
    const pendingItems = getPendingItems(ballot.scores);
    if (pendingItems.length > 0) setIncompleteDialog(pendingItems);
    else setSubmitConfirm(true);
  };

  const goToScore = (scoreId) => {
    const idx = ballot.scores.findIndex((s) => s.id === scoreId);
    if (idx !== -1) setActiveItemIndex(idx);
    requestAnimationFrame(() => {
      cardSectionRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
  };

  const renderScoreDecision = (scoreItem, troupeName, rubricName) => {
    const isItemSaving = itemStatuses[scoreItem.id]?.status === "saving";
    const itemError = itemStatuses[scoreItem.id]?.status === "error" ? itemStatuses[scoreItem.id].errorMsg : null;

    if (scoreItem.evaluationState !== "PENDING") {
      const isNotPresented = scoreItem.evaluationState === "NOT_PRESENTED";
      return (
        <div className="score-resolved-compact">
          <div
            className={`locked-score ${isNotPresented ? "not-presented" : "is-sealed"}`}
            aria-label={`${troupeName}: ${scoreItem.itemName}, ${isNotPresented ? "Ítem no presentado" : `puntuado ${scoreItem.score}`}`}
          >
            <span aria-hidden="true">{isNotPresented ? "⊘" : "✓"}</span>
            <div>
              {isNotPresented ? (
                <strong>Ítem no presentado</strong>
              ) : (
                <strong className="sealed-score">
                  <span className="sealed-score-value" aria-hidden="true">{scoreItem.score}</span>
                  <span className="sealed-score-caption">puntos</span>
                </strong>
              )}
              <small>Decisión registrada</small>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="score-actions" role="group" aria-label={`${troupeName}: ${scoreItem.itemName}`}>
        <div className="score-copy">
          <span className="score-copy-name">{scoreItem.itemName}</span>
        </div>

        {/* 1-10 grid: solo números, cada tap abre modal Spec 007 RF-77 */}
        <div role="group" aria-label={`Puntuación para ${scoreItem.itemName}`} className="score-grid-v3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
            <button
              key={val}
              type="button"
              aria-label={`Votar ${val}`}
              disabled={readonly || scoreItem.status === "LOCKED" || isItemSaving}
              className="score-option-btn score-num-only"
              onClick={() => handleScoreClick(scoreItem, val, troupeName, rubricName)}
            >
              <span className="score-num" aria-hidden="true">{val}</span>
            </button>
          ))}
        </div>

        {/* Segregated "No se presentó" */}
        <div className="not-presented-section">
          <p className="not-presented-hint">Esta decisión se registra para este ítem de la comparsa.</p>
          <button
            type="button"
            className="not-presented-btn"
            disabled={readonly || scoreItem.status === "LOCKED" || isItemSaving}
            onClick={() => setNotPresentedConfirm({
              id: scoreItem.id,
              troupeName,
              rubricName,
              itemName: scoreItem.itemName,
            })}
          >
            <span aria-hidden="true">⚠</span> No se presentó este ítem
          </button>
        </div>

        {/* Granular per-item network status & retry */}
        {isItemSaving && (
          <p className="item-saving-copy" role="status">Guardando decisión…</p>
        )}
        {itemError && (
          <div className="item-status-error" role="alert">
            <span>Fallo al guardar ítem</span>
            <button
              type="button"
              className="item-retry-btn"
              onClick={() => handleRetry(scoreItem.id)}
            >
              Reintentar
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <PageShell layer="instrument" className="judge-ballot-page judge-operation-shell">
      <div className={`ballot-layout${readonly ? " is-readonly" : ""}`}>
        {!readonly && (
        <aside className="ballot-context-rail" aria-label="Contexto de la planilla">
          <nav className="ballot-troupe-navigation" aria-label="Comparsas">
            <ul>
              {groups.map((group) => {
                const isGroupLocked = Boolean(!readonly && activeGroup && group.presentationOrder > activeGroup.presentationOrder);
                const groupTotal = Object.values(group.rubrics).reduce((n, r) => n + r.scores.length, 0);
                const groupResolved = Object.values(group.rubrics).reduce((n, r) => n + r.scores.filter((s) => s.evaluationState !== "PENDING").length, 0);
                // Resaltada = comparsa que se está votando actualmente (primer grupo
                // con pendientes), no la última ya votada que se esté consultando.
                const currentKey = activeGroup ? activeGroup.nightScheduleId : activeScore?.nightScheduleId;
                const isCurrentGroup = Boolean(currentKey && String(group.nightScheduleId) === String(currentKey));
                return (
                  <li key={group.nightScheduleId}>
                    <button
                      type="button"
                      className={`ballot-sidebar-item${isGroupLocked ? " is-locked" : ""}${isCurrentGroup ? " is-current" : ""}`}
                      disabled={isGroupLocked}
                      aria-disabled={isGroupLocked ? "true" : undefined}
                      aria-current={isCurrentGroup ? "true" : undefined}
                      title={isGroupLocked ? "En espera de pasada" : undefined}
                      onClick={() => {
                        if (isGroupLocked) return;
                        const allScores = Object.values(group.rubrics).flatMap((r) => r.scores);
                        const firstPending = allScores.find((s) => s.evaluationState === "PENDING") ?? allScores[0];
                        if (firstPending) goToScore(firstPending.id);
                      }}
                    >
                      {group.brandColor && (
                        <span
                          className="troupe-color-dot"
                          style={{ backgroundColor: group.brandColor }}
                          aria-hidden="true"
                        />
                      )}
                      <span className="ballot-sidebar-name">{group.presentationOrder}. {group.troupeName}</span>
                      <span className={`ballot-sidebar-status ${isGroupLocked ? "is-locked" : groupResolved === groupTotal ? "is-done" : groupResolved > 0 ? "is-progress" : ""}`}>
                        {isGroupLocked ? "🔒" : `${groupResolved}/${groupTotal}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {activeScore && (() => {
            const currentGroup = groups.find((group) => group.nightScheduleId === activeScore.nightScheduleId);
            if (!currentGroup) return null;
            const troupeItems = Object.values(currentGroup.rubrics).flatMap((rubric) =>
              rubric.scores.map((score) => ({ ...score, rubricName: rubric.rubricName }))
            );
            const troupeDone = troupeItems.filter((item) => item.evaluationState !== "PENDING").length;
            const troupePct = troupeItems.length ? Math.round((troupeDone / troupeItems.length) * 100) : 0;
            return (
              <section className={`ballot-summary${summaryOpen ? " is-open" : " is-collapsed"}`} aria-label="Resumen de la comparsa">
                <button
                  type="button"
                  className="ballot-summary-toggle"
                  aria-expanded={summaryOpen}
                  aria-label={summaryOpen ? "Ocultar resumen de la comparsa" : "Ampliar resumen de la comparsa"}
                  onClick={() => setSummaryOpen((prev) => !prev)}
                >
                  <span className="ballot-summary-heading">
                    <span className="judge-section-title">Resumen</span>
                    <span className="ballot-summary-chevron" aria-hidden="true" />
                    <span className="ballot-summary-count" aria-hidden="true">{troupeDone}/{troupeItems.length}</span>
                  </span>
                  <span className="ballot-summary-progress" aria-hidden="true">
                    <span style={{ inlineSize: `${troupePct}%` }} />
                  </span>
                </button>
                <p className="eyebrow">{currentGroup.troupeName}</p>
                {summaryOpen && (
                  <div className="ballot-summary-body">
                    <ul className="judge-list">
                      {troupeItems.map((item) => {
                        const isResolved = item.evaluationState !== "PENDING";
                        const isNotPresented = item.evaluationState === "NOT_PRESENTED";
                        const isActive = item.id === activeScore.id;
                        const statusClass = isNotPresented ? "is-np" : isResolved ? "is-scored" : "is-pending";
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              className={`ballot-summary-item${isActive ? " is-active" : ""}`}
                              aria-current={isActive ? "true" : undefined}
                              aria-label={`Ir al ítem ${item.itemName}`}
                              onClick={() => goToScore(item.id)}
                            >
                              <span className={`ballot-summary-status ${statusClass}`} aria-hidden="true">{isNotPresented ? "⊘" : isResolved ? "✓" : "○"}</span>
                              <span className="ballot-summary-name">{item.itemName}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="judge-note">{troupeDone} / {troupeItems.length} completos · {troupePct}%</p>
                  </div>
                )}
              </section>
            );
          })()}
        </aside>
        )}

        <div className="ballot-main">
          <header className="ballot-header ballot-header-single">
            <div>
              <a className="back-link" href="#/judge">← Mis comparsas</a>
              <p className="eyebrow">{ballot.nightName} · {ballot.specialtyName}</p>
              <h1 className="ballot-header-support">{readonly && targetGroup ? targetGroup.troupeName : activeScore ? activeScore.troupeName : ballot.nightName}</h1>
              {readonly && targetGroup
                ? <p>Salida {targetGroup.presentationOrder} · Planilla con {groups.length} comparsas</p>
                : activeScore && <p>Salida {activeScore.presentationOrder}</p>}
            </div>
            <div className="ballot-header-status">
              <StatusPill status={ballot.status} />
            </div>
          </header>

          <section className="ballot-progress ballot-progress-stack" aria-label="Progreso de la votación">
            <ProgressBar
              value={troupeResolved}
              max={troupeScores.length}
              label="Avance de la comparsa"
              sublabel={`${activeScore?.troupeName ?? "Sin comparsa"} · ${troupeResolved} de ${troupeScores.length} · ${troupeProgress}%`}
            />
            <ProgressBar
              value={resolved}
              max={total}
              label="Avance de la planilla"
              sublabel={`${resolved} de ${total} puntuaciones completadas · ${progress}%`}
            />
          </section>

          <p className="feedback" role="status" aria-live="polite">{message}</p>

          {continuityPrompt && (
            <section
              className="troupe-continuity-banner"
              role="region"
              aria-label="Pasada completada"
            >
              <div className="continuity-banner-content">
                <div className="continuity-banner-info">
                  <span className="continuity-icon" aria-hidden="true">🎉</span>
                  <div>
                    <strong>¡Completaste la evaluación de {continuityPrompt.completedTroupeName}!</strong>
                    <p>Siguiente comparsa en pista: <strong>{continuityPrompt.nextTroupeName}</strong></p>
                  </div>
                </div>
                <div className="continuity-banner-actions">
                  <button
                    type="button"
                    className="button button-primary continuity-next-btn"
                    onClick={() => {
                      const nextId = continuityPrompt.nextNightScheduleId;
                      setContinuityPrompt(null);
                      lastTroupeRef.current = null;
                      setSelectedTroupeId(nextId);
                      window.location.hash = `#/judge/ballot?ballotId=${ballotId}&troupeId=${encodeURIComponent(nextId)}`;
                      const nextGrp = groups.find((g) => String(g.nightScheduleId) === String(nextId));
                      const nextScores = nextGrp ? Object.values(nextGrp.rubrics).flatMap((r) => r.scores) : [];
                      const firstPending = nextScores.find((s) => s.evaluationState === "PENDING") ?? nextScores[0];
                      if (firstPending) goToScore(firstPending.id);
                    }}
                  >
                    Comenzar siguiente pasada ({continuityPrompt.nextTroupeName}) →
                  </button>
                  <button
                    type="button"
                    className="button button-secondary continuity-dismiss-btn"
                    onClick={() => setContinuityPrompt(null)}
                    aria-label="Cerrar aviso de continuidad"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </section>
          )}

          {readonly && (
            <section className="readonly-notice">
              <span aria-hidden="true">🔒</span>
              <div>
                <strong>Planilla confirmada</strong>
                <p>Esta planilla es solo para consulta y ya no puede modificarse.</p>
              </div>
            </section>
          )}

          <div className="ballot-workspace">
            {readonly ? (
              <section className="ballot-readonly-summary" aria-label="Resumen de la planilla">
                <div className="readonly-hero">
                  <span className="readonly-hero-icon" aria-hidden="true">✓</span>
                  <div>
                    <p className="eyebrow">Planilla confirmada · {groups.length} {groups.length === 1 ? "comparsa" : "comparsas"}</p>
                    <p className="readonly-hero-total"><strong>{scoreTotal}</strong> puntos en total</p>
                  </div>
                </div>
                {targetGroup && !showAllReadonlyGroups && !readonlyTroupeFilter && <p className="judge-note">Mostrando la sección de <strong>{targetGroup.troupeName}</strong>. Usá el control para ver el resumen de todas las comparsas.</p>}
                <div className="readonly-summary-controls" aria-label="Filtros del resumen de planilla">
                  <label>Comparsa
                    <select value={readonlyTroupeFilter} onChange={(event) => { setReadonlyTroupeFilter(event.target.value); if (event.target.value) setShowAllReadonlyGroups(true); }}>
                      <option value="">Todas</option>
                      {groups.map((group) => <option key={group.nightScheduleId} value={String(group.nightScheduleId)}>{group.troupeName}</option>)}
                    </select>
                  </label>
                  <label>Rubro
                    <select value={readonlyRubricFilter} onChange={(event) => setReadonlyRubricFilter(event.target.value)}>
                      <option value="">Todos</option>
                      {(() => {
                        const seen = new Set();
                        return groups.flatMap((group) =>
                          Object.values(group.rubrics).filter((rubric) => {
                            const key = String(rubric.rubricId);
                            if (seen.has(key)) return false;
                            seen.add(key);
                            return true;
                          })
                        ).map((rubric) => (
                          <option key={rubric.rubricId} value={String(rubric.rubricId)}>
                            {rubric.rubricName ?? `Rubro ${rubric.rubricId}`}
                          </option>
                        ));
                      })()}
                    </select>
                  </label>
                  {targetGroup && groups.length > 1 && <button type="button" className="secondary" onClick={() => {
                    setShowAllReadonlyGroups((value) => !value);
                    setReadonlyTroupeFilter("");
                    setReadonlyRubricFilter("");
                  }}>{showAllReadonlyGroups ? "Ver solo la comparsa seleccionada" : "Ver resumen de todas las comparsas"}</button>}
                </div>
                {groups.length > 1 && (
                  <nav className="readonly-troupe-index" aria-label="Ir a una comparsa">
                    {groups.map((group) => (
                      <button
                        key={group.nightScheduleId}
                        type="button"
                        className="readonly-troupe-chip"
                        aria-label={`Ir a ${group.troupeName}`}
                        onClick={() => { setShowAllReadonlyGroups(true); setReadonlyTroupeFilter(String(group.nightScheduleId)); goToReadonlyGroup(group); }}
                      >
                        <span aria-hidden="true">{group.presentationOrder}</span> {group.troupeName}
                      </button>
                    ))}
                  </nav>
                )}
                {groups.filter((group) => !targetGroup || showAllReadonlyGroups || !selectedTroupeId || String(group.nightScheduleId) === String(selectedTroupeId))
                  .filter((group) => !readonlyTroupeFilter || String(group.nightScheduleId) === readonlyTroupeFilter)
                  .map((group, groupIndex) => {
                  const groupScores = Object.values(group.rubrics).flatMap((rubric) =>
                    rubric.scores.map((score) => ({ ...score, rubricName: rubric.rubricName }))
                  ).filter((score) => !readonlyRubricFilter || String(score.rubricId) === readonlyRubricFilter);
                  const groupTotal = groupScores.reduce((sum, s) => sum + (typeof s.score === "number" ? s.score : 0), 0);
                  const isSelected = Boolean(targetGroup && String(group.nightScheduleId) === String(targetGroup.nightScheduleId));
                  const isOpen = isGroupOpen(group, isSelected, groupIndex === 0);
                  return (
                    <article
                      key={group.nightScheduleId}
                      id={`readonly-group-${group.nightScheduleId}`}
                      ref={(el) => {
                        if (el) readonlyGroupRefs.current.set(String(group.nightScheduleId), el);
                        else readonlyGroupRefs.current.delete(String(group.nightScheduleId));
                      }}
                      className={`readonly-group${isSelected ? " is-selected" : ""}${isOpen ? " is-open" : " is-collapsed"}`}
                      aria-current={isSelected ? "true" : undefined}
                    >
                      {group.brandColor && (
                        <div
                          className="troupe-brand-stripe"
                          style={{ backgroundColor: group.brandColor }}
                          aria-hidden="true"
                        />
                      )}
                      <header className="readonly-group-header">
                        <span className="readonly-order-badge" aria-hidden="true">{group.presentationOrder}</span>
                        <div className="readonly-group-titles">
                          <h2>
                            <button
                              type="button"
                              className="readonly-group-toggle"
                              aria-expanded={isOpen}
                              aria-label={isOpen ? `Ocultar votaciones de ${group.troupeName}` : `Ampliar votaciones de ${group.troupeName}`}
                              onClick={() => toggleReadonlyGroup(group)}
                            >
                              <span>{group.troupeName}{isSelected ? " · Seleccionada" : ""}</span>
                              <span className="readonly-group-chevron" aria-hidden="true" />
                            </button>
                          </h2>
                          <p>{groupScores.length} {groupScores.length === 1 ? "ítem" : "ítems"}</p>
                        </div>
                        <span className="readonly-group-subtotal" aria-label={`Subtotal: ${groupTotal} puntos`}>{groupTotal} pts</span>
                      </header>
                      {isOpen && (
                        <div className="readonly-group-body">
                          <ul className="judge-list readonly-group-list">
                            {groupScores.map((score) => {
                              const isNotPresented = score.evaluationState === "NOT_PRESENTED";
                              return (
                                <li key={score.id} className={`judge-list-row${isNotPresented ? " is-np" : ""}`}>
                                  <span className="judge-list-check" aria-hidden="true">{isNotPresented ? "⊘" : "✓"}</span>
                                  <div className="judge-list-main">
                                    <h3>{score.itemName}</h3>
                                    <p>{score.rubricName}</p>
                                    {(score.evaluationObjective || score.expectedSubjectType) && <p className="evaluation-context">{score.evaluationObjective}{score.expectedSubjectType ? ` · Sujeto: ${SUBJECT_LABELS[score.expectedSubjectType] ?? score.expectedSubjectType}` : ""}</p>}
                                  </div>
                                  <span className="readonly-score-value">{isNotPresented ? "Ítem no presentado" : `${score.score} pts`}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </article>
                  );
                })}
                <p className="judge-note">Resumen de solo lectura.</p>
              </section>
            ) : (
            /* Modelo un-ítem-por-vez (Fase 1): la tarjeta activa es el flujo principal */
            activeScore && (() => {
              const isCardScoreLocked = Boolean(
                !readonly &&
                activeGroup &&
                activeScore.presentationOrder > activeGroup.presentationOrder
              );
              return (
                <section ref={cardSectionRef} className="ballot-card-mode ballot-single" aria-label={`Evaluación: ${activeScore.troupeName} - ${activeScore.itemName}`}>
                  <div className="ballot-card-header">
                    {activeScore.brandColor && (
                      <div
                        className="troupe-brand-stripe"
                        style={{ backgroundColor: activeScore.brandColor }}
                        aria-hidden="true"
                      />
                    )}
                    <p className="eyebrow">Salida {activeScore.presentationOrder} · {ballot.specialtyName}</p>
                    <h2>{activeScore.troupeName}</h2>
                    <p className="card-rubric-name">{activeScore.rubricName}</p>
                  </div>

                  {!readonly && !isCardScoreLocked && activeTroupePending > 0 && (
                    <div className="troupe-absent-actions">
                      <button
                        type="button"
                        className="troupe-absent-btn"
                        disabled={markingAbsent}
                        onClick={() => setTroupeAbsentConfirm({
                          nightScheduleId: activeScore.nightScheduleId,
                          troupeName: activeScore.troupeName,
                          pendingCount: activeTroupePending,
                        })}
                      >
                        <span aria-hidden="true">⚠</span> {markingAbsent ? "Marcando…" : "Comparsa completa no se presentó"}
                      </button>
                    </div>
                  )}

                  <div className="card-item-body">
                    {isCardScoreLocked ? (
                      <div className="troupe-locked-card">
                        <span aria-hidden="true" className="troupe-locked-icon">🔒</span>
                        <strong>Comparsa en espera de pasada</strong>
                        <p className="troupe-locked-copy">
                          Se habilitará automáticamente al completar la comparsa anterior ({activeGroup?.troupeName}).
                        </p>
                      </div>
                    ) : (
                      <>
                        <h3 className="card-item-title">{activeScore.itemName}</h3>
                        <p className="rubric-instruction">Seleccioná una puntuación para este criterio.</p>
                        {(activeScore.evaluationObjective || activeScore.expectedSubjectType) && <p className="evaluation-context">
                          {activeScore.evaluationObjective && <span>{activeScore.evaluationObjective}</span>}
                          {activeScore.expectedSubjectType && <span> · Sujeto: {SUBJECT_LABELS[activeScore.expectedSubjectType] ?? activeScore.expectedSubjectType}</span>}
                        </p>}
                        {renderScoreDecision(activeScore, activeScore.troupeName, activeScore.rubricName)}
                      </>
                    )}
                  </div>

                  <nav className="ballot-item-nav" aria-label="Navegación de planilla">
                    <div className="bottom-bar-content">
                      <div className="bottom-bar-nav-btns">
                        <button
                          type="button"
                          className="nav-btn prev-btn"
                          disabled={effectiveIndex <= 0}
                          onClick={() => setActiveItemIndex((prev) => Math.max(0, prev - 1))}
                          aria-label="Ítem anterior"
                        >
                          ← Anterior
                        </button>
                        <span className="nav-counter" aria-live="polite">
                          Ítem {effectiveIndex + 1} de {total}
                        </span>
                        {/* Sin duplicar el avance: mientras el banner de continuidad ofrece
                          "Comenzar siguiente pasada", el Siguiente genérico se oculta. */}
                        {!continuityPrompt && (
                          <button
                            type="button"
                            className="nav-btn next-btn"
                            disabled={effectiveIndex >= total - 1}
                            onClick={() => setActiveItemIndex((prev) => Math.min(total - 1, prev + 1))}
                            aria-label="Ítem siguiente"
                          >
                            Siguiente →
                          </button>
                        )}
                      </div>
                      {!readonly && (
                        <button
                          type="button"
                          className="faltantes-btn"
                          onClick={() => setPendingDialogOpen(true)}
                        >
                          Faltantes anteriores ({previousPendingScores.length})
                        </button>
                      )}
                    </div>
                  </nav>
                  <p className="ballot-shortcuts-hint">Atajos: 1–9 · 0 = 10</p>
                </section>
              );
            })())}
          </div>

          {!readonly && total > 0 && pendingScores.length === 0 && (
            <section className="review-ready-banner" aria-label="Lista para revisar">
              <div>
                <strong>Lista para revisar</strong>
                <p>{total} de {total} puntuaciones completas. Usá el botón Confirmar votación de abajo para el cierre definitivo.</p>
              </div>
            </section>
          )}

          <footer className="ballot-footer">
            <a className="secondary button-link" href="#/judge">← Comparsas</a>
            <span className="save-indicator" role="status" aria-live="polite">
              {message === "Decisión confirmada en el servidor." ? (
                <><span aria-hidden="true">☁✓</span> Guardado</>
              ) : message?.includes("No hay conexión") ? (
                <><span aria-hidden="true">⚠</span> Error de guardado — reintentá</>
              ) : null}
            </span>
            {!readonly && (
              <>
                <button
                  ref={submitButtonRef}
                  type="button"
                  disabled={!canConfirmVoting}
                  aria-describedby={!canConfirmVoting ? "voting-confirm-help" : "voting-confirm-summary"}
                  onClick={beginSubmitReview}
                >
                  {isSubmitting ? "Confirmando…" : "Confirmar votación"}
                </button>
                {canConfirmVoting && (
                  <small id="voting-confirm-summary" className="voting-confirm-summary" aria-live="polite">
                    {groups.map((g) => {
                      const gTotal = Object.values(g.rubrics)
                        .flatMap((r) => r.scores)
                        .reduce((sum, s) => sum + (typeof s.score === "number" ? s.score : 0), 0);
                      return `${g.troupeName}: ${gTotal} pts`;
                    }).join(" · ")}
                  </small>
                )}
              </>
            )}
            {!readonly && !canConfirmVoting && <small id="voting-confirm-help">Completá todas las puntuaciones y esperá su confirmación en el servidor para habilitar el cierre.</small>}
            {readonly && (
              <section className="locked-sheet" aria-label="Planilla confirmada">
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>Planilla confirmada</strong>
                  <p>Total registrado: {scoreTotal} puntos · Evaluación cerrada</p>
                </div>
              </section>
            )}
          </footer>
        </div>
      </div>

      {/* Faltantes Dialog (RF-188) */}
      <Dialog
        isOpen={pendingDialogOpen}
        onClose={() => setPendingDialogOpen(false)}
        title="Faltantes anteriores"
        description="Ítems anteriores al actual que todavía no votaste. Seleccioná uno para volver a él."
      >
        <ul className="pending-dialog-list" aria-label="Ítems anteriores sin votar">
          {previousPendingScores.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="pending-item-jump-btn"
                onClick={() => {
                  goToScore(item.id);
                  setPendingDialogOpen(false);
                }}
              >
                <span className="pending-troupe">{item.troupeName}</span>
                <span className="pending-rubric">{item.rubricName}</span>
                <strong className="pending-item-name">{item.itemName}</strong>
              </button>
            </li>
          ))}
          {previousPendingScores.length === 0 && (
            <li>
              <p>No tenés ítems anteriores sin votar.</p>
            </li>
          )}
        </ul>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setPendingDialogOpen(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Incomplete Ballot Dialog (attempted submit with pendings) */}
      <Dialog
        isOpen={Boolean(incompleteDialog)}
        onClose={() => setIncompleteDialog(null)}
        title="Faltan decisiones por resolver"
        description="Asigná una puntuación de 1 a 10 o marcá No se presentó en cada ítem antes de confirmar."
      >
        <ul className="pending-dialog-list" aria-label="Ítems pendientes">
          {incompleteDialog?.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="pending-item-jump-btn"
                onClick={() => {
                  goToScore(item.id);
                  setIncompleteDialog(null);
                }}
              >
                <span className="pending-troupe">{item.troupeName}</span>
                <span className="pending-rubric">{item.rubricName}</span>
                <strong className="pending-item-name">{item.itemName}</strong>
              </button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setIncompleteDialog(null)}>
            Volver a la planilla
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Score confirmation modal (Spec 007 RF-77) */}
      <Dialog
        isOpen={Boolean(scoreConfirm)}
        onClose={() => setScoreConfirm(null)}
        title="Confirmación de voto"
        description="Una vez confirmada, esta decisión no podrá modificarse."
      >
        {scoreConfirm && (
          <div className="score-dialog-content">
            <p><strong>{scoreConfirm.troupeName}</strong></p>
            <p>{scoreConfirm.rubricName} — {scoreConfirm.itemName}</p>
            <p className="confirm-score-display is-solid">
              Usted está por votar <strong className="confirm-score-value">{scoreConfirm.score}</strong>. ¿Desea confirmar?
            </p>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setScoreConfirm(null)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const target = scoreConfirm;
                  setScoreConfirm(null);
                  void saveDecision(target.scoreId, "SCORED", target.score);
                }}
              >
                Confirmar
              </Button>
            </DialogFooter>
          </div>
        )}
      </Dialog>

      {/* Registrar ausencia para el ítem actual, sin acción masiva por comparsa. */}
      <Dialog
        isOpen={Boolean(notPresentedConfirm)}
        onClose={() => setNotPresentedConfirm(null)}
        title="Confirmación de voto"
        description="Una vez confirmada, esta decisión no podrá modificarse."
      >
        {notPresentedConfirm && (
          <div className="not-presented-dialog-content">
            <p><strong>{notPresentedConfirm.troupeName}</strong></p>
            <p>{notPresentedConfirm.rubricName} — {notPresentedConfirm.itemName}</p>
            <p className="warning-inline-alert">
              Se registrará este ítem como no presentado con 0 puntos. La decisión es inmutable.
            </p>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setNotPresentedConfirm(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const target = notPresentedConfirm;
                  setNotPresentedConfirm(null);
                  void saveDecision(target.id, "NOT_PRESENTED", 0);
                }}
              >
                Confirmar
              </Button>
            </DialogFooter>
          </div>
        )}
      </Dialog>

      {/* Registrar ausencia para toda la comparsa (acción masiva auditable). */}
      <Dialog
        isOpen={Boolean(troupeAbsentConfirm)}
        onClose={() => setTroupeAbsentConfirm(null)}
        title="Confirmación de voto"
        description="Una vez confirmada, esta decisión no podrá modificarse."
      >
        {troupeAbsentConfirm && (
          <div className="not-presented-dialog-content">
            <p><strong>{troupeAbsentConfirm.troupeName}</strong></p>
            <p className="warning-inline-alert">
              Se registrarán {troupeAbsentConfirm.pendingCount} {troupeAbsentConfirm.pendingCount === 1 ? "ítem pendiente" : "ítems pendientes"} como no presentados (0 puntos). Los ítems ya puntuados no se modifican. La decisión es inmutable.
            </p>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setTroupeAbsentConfirm(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={markingAbsent}
                onClick={() => {
                  const target = troupeAbsentConfirm;
                  setTroupeAbsentConfirm(null);
                  void markTroupeAbsent(target.nightScheduleId);
                }}
              >
                Confirmar
              </Button>
            </DialogFooter>
          </div>
        )}
      </Dialog>

      {/* Final Submit Confirmation Modal: cierra la PLANILLA completa, no una comparsa */}
      <Dialog
        isOpen={submitConfirm}
        onClose={() => setSubmitConfirm(false)}
        title="Cierre definitivo de planilla"
        description="Una vez confirmada, esta planilla no podrá modificarse."
      >
        <div className="submit-dialog-content">
          <p className="eyebrow">Confirmar votación · {ballot.specialtyName}</p>
          <p>Estás por cerrar la planilla de <strong>{ballot.nightName}</strong> con las <strong>{groups.length} comparsas</strong> asignadas a tu especialidad. No se cierra una sola comparsa.</p>
          <ul className="submit-dialog-troupes" aria-label="Comparsas incluidas en el cierre">
            {groups.map((group) => {
              const troupeTotal = Object.values(group.rubrics)
                .flatMap((r) => r.scores)
                .reduce((sum, s) => sum + (typeof s.score === "number" ? s.score : 0), 0);
              return (
                <li key={group.nightScheduleId} className="submit-dialog-troupe">
                  <strong>{group.presentationOrder}. {group.troupeName}</strong>
                  {Object.values(group.rubrics).map((rubric) => (
                    <ul key={rubric.rubricId} className="submit-dialog-rubric">
                      <li className="rubric-header">{rubric.rubricName}</li>
                      {rubric.scores.map((score) => (
                        <li key={score.id} className="submit-dialog-item">
                          {score.itemName}:{" "}
                          {score.evaluationState === "NOT_PRESENTED"
                            ? "No se presentó (0)"
                            : `${score.score} pts`}
                        </li>
                      ))}
                    </ul>
                  ))}
                  <span className="troupe-subtotal">Subtotal: {troupeTotal} pts</span>
                </li>
              );
            })}
          </ul>
          <p className="confirm-score-display">
            Total registrado: <strong>{scoreTotal} puntos</strong>
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSubmitConfirm(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setSubmitConfirm(false);
                void submit();
              }}
              disabled={isSubmitting}
            >
              Confirmar y cerrar
            </Button>
          </DialogFooter>
        </div>
      </Dialog>
    </PageShell>
  );
}

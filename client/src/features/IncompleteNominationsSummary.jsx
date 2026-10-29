function groupNominations(nominations) {
  const groups = new Map();
  for (const nomination of nominations ?? []) {
    const key = nomination.troupeId ?? nomination.troupeName ?? "unknown-troupe";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: nomination.troupeName ?? "Comparsa sin nombre",
        nominations: [],
      });
    }
    groups.get(key).nominations.push(nomination);
  }
  return [...groups.values()];
}

export function IncompleteNominationsSummary({ nominations = [] }) {
  if (nominations.length === 0) return null;
  const groups = groupNominations(nominations);
  const nominationLabel = `${nominations.length} ${nominations.length === 1 ? "faltante" : "faltantes"}`;
  const troupeLabel = `${groups.length} ${groups.length === 1 ? "comparsa" : "comparsas"}`;

  return (
    <div className="incomplete-nominations-summary">
      <p>
        Hay {nominationLabel} en {troupeLabel}.
      </p>
      <details>
        <summary>Ver faltantes</summary>
        <ul>
          {groups.map((group) => (
            <li key={group.key}>
              <strong>{group.name}</strong>
              <ul>
                {group.nominations.map((nomination) => (
                  <li key={`${nomination.rubricId}-${nomination.troupeId}`}>
                    Falta un participante para {nomination.rubricName ?? "el rubro"}.
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <a href="#/admin/competencia?step=participantes">Ir a Participantes</a>
      </details>
    </div>
  );
}

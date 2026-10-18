import { useEffect, useState } from "react";
import { apiRequest } from "../api/http.js";

const minSearchLength = 2;
const resultLimit = 5;
const searchDelayMs = 250;

export function AdminPromotionSearch({ busy, refreshKey, onPromote, triggerRef }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searchError, setSearchError] = useState(false);
  const [searching, setSearching] = useState(false);
  const trimmedQuery = query.trim();
  const canSearch = trimmedQuery.length >= minSearchLength;

  useEffect(() => {
    if (!canSearch) {
      setResults([]);
      setSearchError(false);
      setSearching(false);
      return undefined;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(false);
      try {
        const params = new URLSearchParams({ excludeRole: "ADMIN", q: trimmedQuery, limit: String(resultLimit) });
        const users = await apiRequest(`/api/v1/users?${params}`);
        if (active) setResults(users);
      } catch {
        if (active) {
          setResults([]);
          setSearchError(true);
        }
      } finally {
        if (active) setSearching(false);
      }
    }, searchDelayMs);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [trimmedQuery, canSearch, refreshKey]);

  return (
    <div className="access-search">
      <label>
        Buscar usuario existente
        <input
          type="search"
          autoComplete="off"
          placeholder="Nombre o correo"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={busy}
        />
      </label>
      {!canSearch && trimmedQuery.length > 0 && (
        <p className="access-search-hint">Escribí al menos {minSearchLength} caracteres.</p>
      )}
      {searchError && <p className="feedback" role="alert">No se pudo buscar usuarios. Intentalo de nuevo.</p>}
      {searching && <p className="access-search-hint" role="status">Buscando…</p>}
      {canSearch && !searching && !searchError && results.length === 0 && (
        <p className="access-search-hint">No hay usuarios sin rol ADMIN que coincidan.</p>
      )}
      {results.length > 0 && (
        <ul className="access-list" aria-label="Resultados de búsqueda">
          {results.map((user) => (
            <li key={user.id} className="access-row">
              <div className="access-person">
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={(event) => {
                  triggerRef.current = event.currentTarget;
                  onPromote(user);
                }}
              >
                Promover a administrador
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

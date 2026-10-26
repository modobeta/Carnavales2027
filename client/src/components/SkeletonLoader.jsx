import { animate, stagger } from "animejs";
import { useMotionScope } from "../motion/useMotionScope.js";

const VARIANTS = new Set(["text", "list", "table", "cards", "ballot"]);

function SkeletonLine({ width = "100%", className = "" }) {
  return <span className={`skeleton-block skeleton-line ${className}`.trim()} data-skeleton style={{ inlineSize: width }} />;
}

function SkeletonCircle() {
  return <span className="skeleton-block skeleton-circle" data-skeleton />;
}

function SkeletonList({ rows }) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-list-row" key={index}>
          <SkeletonCircle />
          <div className="skeleton-list-copy">
            <SkeletonLine width={`${70 - (index % 3) * 8}%`} />
            <SkeletonLine width={`${46 - (index % 2) * 6}%`} className="is-soft" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonTable({ rows }) {
  return (
    <div className="skeleton-table" role="presentation">
      <div className="skeleton-table-head">
        <SkeletonLine width="28%" />
        <SkeletonLine width="20%" />
        <SkeletonLine width="18%" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-table-row" key={index}>
          <SkeletonLine width={`${34 - (index % 2) * 7}%`} />
          <SkeletonLine width={`${22 - (index % 3) * 3}%`} className="is-soft" />
          <SkeletonLine width={`${18 - (index % 2) * 2}%`} className="is-soft" />
        </div>
      ))}
    </div>
  );
}

function SkeletonCards({ rows }) {
  return (
    <div className="skeleton-cards">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-card" key={index}>
          <div className="skeleton-card-head">
            <SkeletonLine width="42%" />
            <SkeletonLine width="18%" className="is-soft" />
          </div>
          <SkeletonLine width="88%" className="is-soft" />
          <SkeletonLine width="64%" className="is-soft" />
          <div className="skeleton-card-foot">
            <SkeletonLine width="26%" />
            <SkeletonLine width="30%" className="is-soft" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonBallot({ rows }) {
  return (
    <div className="skeleton-ballot">
      <div className="skeleton-ballot-header">
        <SkeletonCircle />
        <div className="skeleton-list-copy">
          <SkeletonLine width="46%" />
          <SkeletonLine width="30%" className="is-soft" />
        </div>
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-ballot-item" key={index}>
          <SkeletonLine width={`${52 - (index % 3) * 8}%`} />
          <div className="skeleton-score-grid" aria-hidden="true">
            {Array.from({ length: 10 }, (_, score) => (
              <span className="skeleton-block skeleton-score" key={score} data-skeleton />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * SkeletonLoader — reemplazo visual de una lista o formulario mientras carga.
 *
 * Conserva el texto de espera existente en la pantalla para no cambiar el
 * mensaje que ya conocen los usuarios ni las pruebas de comportamiento.
 */
export function SkeletonLoader({
  variant = "text",
  rows = 3,
  label = "Cargando…",
  className = "",
}) {
  const safeVariant = VARIANTS.has(variant) ? variant : "text";
  const safeRows = Math.max(1, Math.min(Number(rows) || 1, 12));

  const rootRef = useMotionScope(
    (root) => {
      animate(root.querySelectorAll("[data-skeleton]"), {
        opacity: [0.45, 1],
        duration: 1_100,
        loop: true,
        alternate: true,
        delay: stagger(35),
        ease: "inOutSine",
      });
    },
    { deps: [safeVariant, safeRows] },
  );

  return (
    <div
      ref={rootRef}
      className={`skeleton-loader skeleton-loader-${safeVariant} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="skeleton-label">{label}</p>
      <div className="skeleton-body" aria-hidden="true">
        {safeVariant === "text" && (
          <div className="skeleton-text">
            {Array.from({ length: safeRows }, (_, index) => (
              <SkeletonLine key={index} width={`${96 - (index % 4) * 12}%`} className={index > 0 ? "is-soft" : ""} />
            ))}
          </div>
        )}
        {safeVariant === "list" && <SkeletonList rows={safeRows} />}
        {safeVariant === "table" && <SkeletonTable rows={safeRows} />}
        {safeVariant === "cards" && <SkeletonCards rows={safeRows} />}
        {safeVariant === "ballot" && <SkeletonBallot rows={safeRows} />}
      </div>
    </div>
  );
}

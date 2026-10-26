import { RequireAdmin } from "./auth/RequireAdmin.jsx";
import { RequireAdminArea } from "./auth/RequireAdminArea.jsx";
import { RequireRole } from "./auth/RequireRole.jsx";
import { RequireResultsRole } from "./auth/RequireResultsRole.jsx";
import { RequirePenaltiesRole } from "./auth/RequirePenaltiesRole.jsx";
import { RequireVotingObserverRole } from "./auth/RequireVotingObserverRole.jsx";
import { useSession } from "./auth/session-context.jsx";
import { AppNavigation } from "./components/AppNavigation.jsx";
import { AdminEventsPage } from "./pages/AdminEventsPage.jsx";
import { AdminHomePage } from "./pages/AdminHomePage.jsx";
import { AdminCompetenciaPage } from "./pages/AdminCompetenciaPage.jsx";
import { AdminJudgesPage } from "./pages/AdminJudgesPage.jsx";
import { AdminUsersPage } from "./pages/AdminUsersPage.jsx";
import { AdminAssignmentsPage } from "./pages/AdminAssignmentsPage.jsx";
import { AdminVotingPage } from "./pages/AdminVotingPage.jsx";
import { AdminPenaltiesPage } from "./pages/AdminPenaltiesPage.jsx";
import { AdminResultsPage } from "./pages/AdminResultsPage.jsx";
import { OfficialRecordPage } from "./pages/OfficialRecordPage.jsx";
import { AcceptedJudgeInvitationPage, AcceptJudgeInvitationPage } from "./pages/AcceptJudgeInvitationPage.jsx";
import { AcceptRoleInvitationPage } from "./pages/AcceptRoleInvitationPage.jsx";
import { AcceptOperationalInvitationPage } from "./pages/AcceptOperationalInvitationPage.jsx";
import { JudgeHomePage } from "./pages/JudgeHomePage.jsx";
import { JudgeBallotPage } from "./pages/JudgeBallotPage.jsx";
import { JudgeAssignmentPage } from "./pages/JudgeAssignmentPage.jsx";
import { VeedorMonitorPage } from "./pages/VeedorMonitorPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { ResetPasswordPage } from "./pages/ResetPasswordPage.jsx";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage.jsx";
import { AccountPage } from "./pages/AccountPage.jsx";
import { PublicResultsPage } from "./pages/PublicResultsPage.jsx";
import { apiRequest } from "./api/http.js";
import { EventCard } from "./components/EventCard.jsx";
import { SkeletonLoader } from "./components/SkeletonLoader.jsx";
import { TransitionWrapper } from "./components/TransitionWrapper.jsx";
import { AdminEventProvider, useAdminEvent } from "./context/AdminEventContext.jsx";
import { useEffect, useState } from "react";
import { markHashHistoryEntry } from "./features/hash-history.js";

function AdminCompetenciaPageWrapper({ initialStep = "participantes", initialTab = "" }) {
  const adminEvent = useAdminEvent();
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (adminEvent) return undefined;
    apiRequest("/api/v1/events").then((evts) => {
      setEvents(evts);
      if (evts.length === 1) setSelectedEvent(evts[0]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [adminEvent]);

  if (adminEvent) {
    if (adminEvent.loading) return <main className="container"><div className="card"><SkeletonLoader variant="cards" rows={2} label="Cargando evento activo..." /></div></main>;
    if (!adminEvent.activeEvent) return (
      <main className="container">
        <div className="card admin-empty-context">
          <p className="eyebrow">Competencia</p>
          <h1>Primero seleccioná un evento</h1>
          <p>La configuración de competencia pertenece a un evento.</p>
          <a className="button-link" href="#/admin/events">Seleccionar evento</a>
        </div>
      </main>
    );
    return <AdminCompetenciaPage event={adminEvent.activeEvent} initialStep={initialStep} initialTab={initialTab} onBack={() => { window.location.hash = "#/admin/events"; }} />;
  }

  if (loading) return <main className="container"><div className="card"><SkeletonLoader variant="cards" rows={2} label="Cargando eventos..." /></div></main>;
  if (!selectedEvent) return (
    <main className="container">
      <div className="card">
        <h1>Competencia</h1>
        <p>Selecciona un evento para administrar su competencia.</p>
        <div className="event-picker-list" role="list">
          {events.map((e) => <EventCard key={e.id} event={e} onSelect={setSelectedEvent} />)}
        </div>
      </div>
    </main>
  );

  return <AdminCompetenciaPage event={selectedEvent} initialStep={initialStep} initialTab={initialTab} onBack={() => setSelectedEvent(null)} />;
}

function RoleArea({ session, role, admin = false, adminArea = false, children }) {
  return adminArea
    ? <RequireAdminArea session={session}>{children}</RequireAdminArea>
    : admin
      ? <RequireAdmin session={session}>{children}</RequireAdmin>
      : <RequireRole session={session} role={role}>{children}</RequireRole>;
}

export default function App({ session: providedSession }) {
  const contextSession = useSession();
  const session = providedSession ?? contextSession;
  const [path, setPath] = useState(window.location.hash || "#/login");
  useEffect(() => {
    markHashHistoryEntry();
    const updatePath = () => {
      markHashHistoryEntry();
      setPath(window.location.hash || "#/login");
    };
    window.addEventListener("hashchange", updatePath);
    return () => window.removeEventListener("hashchange", updatePath);
  }, []);
  const [route, query = ""] = path.split("?");
  const isBrandRoute =
    route === "#/login" ||
    route === "" ||
    route.startsWith("#/invitations") ||
    route === "#/reset-password" ||
    route === "#/forgot-password" ||
    route === "#/resultados";
  const currentLayer = isBrandRoute ? "brand" : "instrument";

  const renderContent = () => {
    if (route === "#/resultados") {
      const eventId = new URLSearchParams(query).get("eventId") ?? null;
      const content = <PublicResultsPage initialEventId={eventId} embedded={session.status === "authenticated"} />;
      return content;
    }
    if (route === "#/invitations/accept") {
      const secret = new URLSearchParams(query).get("secret") ?? "";
      return <AcceptJudgeInvitationPage key={secret} secret={secret} />;
    }
    if (route === "#/invitations/role/accept") {
      const token = new URLSearchParams(query).get("token") ?? "";
      return <AcceptRoleInvitationPage key={token} token={token} />;
    }
    if (route === "#/invitations/operational/accept") {
      const secret = new URLSearchParams(query).get("secret") ?? "";
      return <AcceptOperationalInvitationPage key={secret} secret={secret} />;
    }
    if (route === "#/invitations/accepted") return <AcceptedJudgeInvitationPage />;
    if (route === "#/reset-password") {
      const token = new URLSearchParams(query).get("token") ?? "";
      return <ResetPasswordPage key={token} token={token} />;
    }
    if (route === "#/forgot-password") return <ForgotPasswordPage />;
    if (route === "#/cuenta") return <AccountPage />;
    if (route === "#/login" || route === "") return <LoginPage />;
  if (route === "#/judge/assignment") {
    return <RoleArea session={session} role="JUDGE"><JudgeAssignmentPage session={session} /></RoleArea>;
  }
  if (route === "#/admin/home") {
    return <RoleArea session={session} adminArea><AdminHomePage session={session} /></RoleArea>;
  }
  if (route === "#/admin/events") {
    return <RoleArea session={session} adminArea><AdminEventsPage /></RoleArea>;
  }
  if (route === "#/admin/competencia") {
    const params = new URLSearchParams(query);
    const initialStep = params.get("step") ?? "participantes";
    const initialTab = params.get("tab") ?? "";
    return <RoleArea session={session} adminArea><AdminCompetenciaPageWrapper initialStep={initialStep} initialTab={initialTab} /></RoleArea>;
  }
  if (route === "#/admin/judges") {
    return <RoleArea session={session} admin><AdminJudgesPage /></RoleArea>;
  }
  if (route === "#/admin/users") {
    return <RoleArea session={session} admin><AdminUsersPage /></RoleArea>;
  }
  if (route === "#/admin/assignments") {
    return <RoleArea session={session} admin><AdminAssignmentsPage initialEventId={new URLSearchParams(query).get("eventId") ?? ""} /></RoleArea>;
  }
  if (route === "#/admin/voting") {
    return <RoleArea session={session} admin><AdminVotingPage /></RoleArea>;
  }
  if (route === "#/admin/penalties") {
    const content = <RequirePenaltiesRole session={session}><AdminPenaltiesPage /></RequirePenaltiesRole>;
    return content;
  }
  if (route === "#/admin/results") {
    const content = <RequireResultsRole session={session}><AdminResultsPage /></RequireResultsRole>;
    return content;
  }
  if (route === "#/admin/record") {
    const content = <RequireResultsRole session={session}><OfficialRecordPage /></RequireResultsRole>;
    return content;
  }
  if (route === "#/veedor") {
    const content = <RequireVotingObserverRole session={session}><VeedorMonitorPage /></RequireVotingObserverRole>;
    return content;
  }
  if (route === "#/judge") {
    return <RoleArea session={session} role="JUDGE"><JudgeHomePage session={session} /></RoleArea>;
  }
  if (route === "#/judge/ballot") {
    return <RoleArea session={session} role="JUDGE"><JudgeBallotPage ballotId={new URLSearchParams(query).get("ballotId") ?? ""} troupeId={new URLSearchParams(query).get("troupeId") ?? ""} userId={session.user?.id ?? ""} /></RoleArea>;
  }
    return <main id="main-content" className="container"><div className="card"><h1>Página no encontrada</h1><a href="#/login">Volver al inicio</a></div></main>;
  };

  const isAdminArea = route.startsWith("#/admin/");
  const showNavigation = session.status === "authenticated" && (
    isAdminArea ||
    route.startsWith("#/judge") ||
    route === "#/veedor" ||
    route === "#/resultados"
  );
  const content = (
    <div className={`app-shell${isAdminArea ? " is-admin" : ""}`} data-layer={currentLayer}>
      {showNavigation && <AppNavigation session={session} />}
      <TransitionWrapper motionKey={route}>
        {renderContent()}
      </TransitionWrapper>
    </div>
  );
  if (session.status !== "authenticated") return content;
  const judgeArea = path.startsWith("#/judge")
    || (session.roles?.length === 1 && session.roles[0] === "JUDGE");
  return <AdminEventProvider key={`${session.user?.id ?? ""}:${session.roles?.join(",")}:${judgeArea}`} session={session} judgeArea={judgeArea}>{content}</AdminEventProvider>;
}

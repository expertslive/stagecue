import { createBrowserRouter } from "react-router-dom";
import SignInPage from "./pages/SignInPage";
import SetupPage from "./pages/SetupPage";
import EventsPage from "./pages/EventsPage";
import EventDashboardPage from "./pages/EventDashboardPage";
import RoomControlPage from "./pages/RoomControlPage";
import RoomShowModePage from "./pages/RoomShowModePage";
import ScheduleEditorPage from "./pages/ScheduleEditorPage";
import MessageTemplatesPage from "./pages/MessageTemplatesPage";
import BrandingPage from "./pages/BrandingPage";
import MembersPage from "./pages/MembersPage";
import ProgrammesPage from "./pages/ProgrammesPage";
import AuditPage from "./pages/AuditPage";
import InvitationAcceptPage from "./pages/InvitationAcceptPage";
import SpeakerView from "./pages/SpeakerView";
import DoorView from "./pages/DoorView";
import LobbyView from "./pages/LobbyView";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import NotFoundPage from "./pages/NotFoundPage";
import ProtectedRoute from "./components/ProtectedRoute";

export const router = createBrowserRouter([
  { path: "/setup", element: <SetupPage /> },
  { path: "/signin", element: <SignInPage /> },
  { path: "/reset-password/:userId/:token", element: <ResetPasswordPage /> },
  { path: "/", element: <ProtectedRoute><EventsPage /></ProtectedRoute> },
  { path: "/events/:eventId", element: <ProtectedRoute><EventDashboardPage /></ProtectedRoute> },
  { path: "/events/:eventId/templates", element: <ProtectedRoute><MessageTemplatesPage /></ProtectedRoute> },
  { path: "/events/:eventId/branding", element: <ProtectedRoute><BrandingPage /></ProtectedRoute> },
  { path: "/events/:eventId/members", element: <ProtectedRoute><MembersPage /></ProtectedRoute> },
  { path: "/events/:eventId/programmes", element: <ProtectedRoute><ProgrammesPage /></ProtectedRoute> },
  { path: "/events/:eventId/audit", element: <ProtectedRoute><AuditPage /></ProtectedRoute> },
  { path: "/invitations/:token", element: <ProtectedRoute><InvitationAcceptPage /></ProtectedRoute> },
  { path: "/rooms/:roomId", element: <ProtectedRoute><RoomControlPage /></ProtectedRoute> },
  { path: "/rooms/:roomId/show", element: <ProtectedRoute><RoomShowModePage /></ProtectedRoute> },
  { path: "/rooms/:roomId/schedule", element: <ProtectedRoute><ScheduleEditorPage /></ProtectedRoute> },
  { path: "/r/:accessCode/speaker", element: <SpeakerView /> },
  { path: "/r/:accessCode/door", element: <DoorView /> },
  { path: "/e/:accessCode/lobby", element: <LobbyView /> },
  { path: "*", element: <NotFoundPage /> },
]);

import { createBrowserRouter } from "react-router-dom";
import SignInPage from "./pages/SignInPage";
import SetupPage from "./pages/SetupPage";
import EventsPage from "./pages/EventsPage";
import EventDashboardPage from "./pages/EventDashboardPage";
import RoomControlPage from "./pages/RoomControlPage";
import ScheduleEditorPage from "./pages/ScheduleEditorPage";
import MessageTemplatesPage from "./pages/MessageTemplatesPage";
import SpeakerView from "./pages/SpeakerView";
import DoorView from "./pages/DoorView";
import LobbyView from "./pages/LobbyView";
import NotFoundPage from "./pages/NotFoundPage";
import ProtectedRoute from "./components/ProtectedRoute";

export const router = createBrowserRouter([
  { path: "/setup", element: <SetupPage /> },
  { path: "/signin", element: <SignInPage /> },
  { path: "/", element: <ProtectedRoute><EventsPage /></ProtectedRoute> },
  { path: "/events/:eventId", element: <ProtectedRoute><EventDashboardPage /></ProtectedRoute> },
  { path: "/events/:eventId/templates", element: <ProtectedRoute><MessageTemplatesPage /></ProtectedRoute> },
  { path: "/rooms/:roomId", element: <ProtectedRoute><RoomControlPage /></ProtectedRoute> },
  { path: "/rooms/:roomId/schedule", element: <ProtectedRoute><ScheduleEditorPage /></ProtectedRoute> },
  { path: "/r/:accessCode/speaker", element: <SpeakerView /> },
  { path: "/r/:accessCode/door", element: <DoorView /> },
  { path: "/e/:accessCode/lobby", element: <LobbyView /> },
  { path: "*", element: <NotFoundPage /> },
]);

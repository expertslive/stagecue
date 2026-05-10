import { createBrowserRouter } from "react-router-dom";
import SignInPage from "./pages/SignInPage";
import SetupPage from "./pages/SetupPage";
import EventsPage from "./pages/EventsPage";
import RoomControlPage from "./pages/RoomControlPage";
import SpeakerView from "./pages/SpeakerView";
import NotFoundPage from "./pages/NotFoundPage";
import ProtectedRoute from "./components/ProtectedRoute";

export const router = createBrowserRouter([
  { path: "/setup", element: <SetupPage /> },
  { path: "/signin", element: <SignInPage /> },
  { path: "/", element: <ProtectedRoute><EventsPage /></ProtectedRoute> },
  { path: "/rooms/:roomId", element: <ProtectedRoute><RoomControlPage /></ProtectedRoute> },
  { path: "/r/:accessCode/speaker", element: <SpeakerView /> },
  { path: "*", element: <NotFoundPage /> },
]);

import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import MainLayout from "./layouts/MainLayout.jsx";
import { Loader } from "./components/ui.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Planner from "./pages/Planner.jsx";
import Assignments from "./pages/Assignments.jsx";
import Timetable from "./pages/Timetable.jsx";
import Progress from "./pages/Progress.jsx";
import Settings from "./pages/Settings.jsx";

function Protected({ children }) {
  const { isAuthed, booting } = useAuth();
  if (booting) return <div className="grid h-full place-items-center"><Loader label="Restoring session…" /></div>;
  return isAuthed ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { isAuthed, booting } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={booting ? <Loader /> : isAuthed ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        element={
          <Protected>
            <MainLayout />
          </Protected>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/planner" element={<Planner />} />
        <Route path="/assignments" element={<Assignments />} />
        <Route path="/timetable" element={<Timetable />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

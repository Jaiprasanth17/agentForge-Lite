import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import AgentBuilder from "./pages/AgentBuilder";
import AgentList from "./pages/AgentList";
import TestConsole from "./pages/TestConsole";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="agents" element={<AgentList />} />
        <Route path="agents/new" element={<AgentBuilder />} />
        <Route path="agents/:id" element={<AgentBuilder />} />
        <Route path="agents/:id/test" element={<TestConsole />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import AgentBuilder from "./pages/AgentBuilder";
import AgentList from "./pages/AgentList";
import TestConsole from "./pages/TestConsole";
import Settings from "./pages/Settings";
import WorkflowsList from "./pages/WorkflowsList";
import WorkflowBuilder from "./pages/WorkflowBuilder";
import WorkflowRunConsole from "./pages/WorkflowRunConsole";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="agents" element={<AgentList />} />
        <Route path="agents/new" element={<AgentBuilder />} />
        <Route path="agents/:id" element={<AgentBuilder />} />
        <Route path="agents/:id/test" element={<TestConsole />} />
        <Route path="workflows" element={<WorkflowsList />} />
        <Route path="workflows/new" element={<WorkflowBuilder />} />
        <Route path="workflows/:id" element={<WorkflowBuilder />} />
        <Route path="workflows/:id/run/:runId" element={<WorkflowRunConsole />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

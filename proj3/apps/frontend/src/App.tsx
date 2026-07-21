import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { KnowledgeLibraryPage } from "./pages/KnowledgeLibraryPage";
import { KnowledgeDetailPage } from "./pages/KnowledgeDetailPage";
import { InterviewHomePage } from "./pages/InterviewHomePage";
import { InterviewHistoryPage } from "./pages/InterviewHistoryPage";
import { InterviewSessionPage } from "./pages/InterviewSessionPage";
import { InterviewResultPage } from "./pages/InterviewResultPage";
import { RevisionDashboardPage } from "./pages/RevisionDashboardPage";
import { LearningPathPage } from "./pages/LearningPathPage";
import { ChatPage } from "./pages/ChatPage";
import { LearningAgentPage } from "./pages/LearningAgentPage";

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/knowledge" element={<KnowledgeLibraryPage />} />
          <Route path="/knowledge/:id" element={<KnowledgeDetailPage />} />
          <Route path="/interviews" element={<InterviewHomePage />} />
          <Route path="/interviews/history" element={<InterviewHistoryPage />} />
          <Route path="/interviews/:id/session" element={<InterviewSessionPage />} />
          <Route path="/interviews/:id/results" element={<InterviewResultPage />} />
          <Route path="/interviews/:id/revision" element={<RevisionDashboardPage />} />
          <Route path="/interviews/:id/learning-path" element={<LearningPathPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/agent" element={<LearningAgentPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

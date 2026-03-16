/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import CheckIn from './pages/CheckIn';
import Dashboard from './pages/Dashboard';
import ParticipantProfile from './pages/ParticipantProfile';
import ProfessionalProfile from './pages/ProfessionalProfile';
import Participants from './pages/Participants';
import Professionals from './pages/Professionals';
import PublicEnrollment from './pages/PublicEnrollment';
import Reports from './pages/Reports';
import Schedule from './pages/Schedule';
import Settings from './pages/Settings';
import Stock from './pages/Stock';
import Trainings from './pages/Trainings';
import TrainingWorkspace from './pages/TrainingWorkspace';
import TrainingWorkspaceMasks from './pages/TrainingWorkspaceMasks';
import AuditLogs from './pages/AuditLogs';
import Enrolled from './pages/Enrolled';
import EnrollmentFieldsManager from './pages/EnrollmentFieldsManager';
import EnrollmentPage from './pages/EnrollmentPage';
import TrainingFeedbackPage from './pages/TrainingFeedbackPage';
import Communication from './pages/Communication';
import TracomaExaminerEvaluationPage from './pages/TracomaExaminerEvaluationPage';
import __Layout from './Layout.jsx';


export const PAGES = {
    "CheckIn": CheckIn,
    "Dashboard": Dashboard,
    "ParticipantProfile": ParticipantProfile,
    "ProfessionalProfile": ProfessionalProfile,
    "Participants": Participants,
    "Professionals": Professionals,
    "PublicEnrollment": PublicEnrollment,
    "Reports": Reports,
    "Schedule": Schedule,
    "Settings": Settings,
    "Stock": Stock,
    "Trainings": Trainings,
    "TrainingWorkspace": TrainingWorkspace,
    "TrainingWorkspaceMasks": TrainingWorkspaceMasks,
    "AuditLogs": AuditLogs,
    "Enrolled": Enrolled,
    "EnrollmentFieldsManager": EnrollmentFieldsManager,
    "EnrollmentPage": EnrollmentPage,
    "TrainingFeedbackPage": TrainingFeedbackPage,
    "Communication": Communication,
    "TracomaExaminerEvaluationPage": TracomaExaminerEvaluationPage,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};
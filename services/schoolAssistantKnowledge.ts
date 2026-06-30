export type SchoolAssistantTopic = {
  id: string;
  question: string;
  shortLabel: string;
  keywords: string[];
  steps: string[];
  path?: string;
  actionLabel?: string;
  relatedIds: string[];
  contexts: string[];
};

export const SCHOOL_ASSISTANT_TOPICS: SchoolAssistantTopic[] = [
  {
    id: "add-student",
    question: "How do I add a new student?",
    shortLabel: "Add a student",
    keywords: ["add student", "new student", "admit student", "enrol student", "register learner"],
    steps: [
      "Open Students from the left menu.",
      "Select Add Student and enter the learner’s personal, class, and parent details.",
      "Review the information, then save the student record.",
    ],
    path: "/admin/students",
    actionLabel: "Open Students",
    relatedIds: ["edit-student", "student-history", "add-teacher"],
    contexts: ["/admin/students", "/admin"],
  },
  {
    id: "edit-student",
    question: "How do I edit a student's information?",
    shortLabel: "Edit student details",
    keywords: ["edit student", "change student", "update learner", "student information"],
    steps: [
      "Open Students and find the learner using search or class filters.",
      "Open the student’s actions menu and choose Edit.",
      "Update the required fields and save your changes.",
    ],
    path: "/admin/students",
    actionLabel: "Open Students",
    relatedIds: ["add-student", "student-history", "move-student"],
    contexts: ["/admin/students"],
  },
  {
    id: "move-student",
    question: "How do I move a student to another class?",
    shortLabel: "Move a student",
    keywords: ["move student", "change class", "promote student", "transfer class"],
    steps: [
      "Open Students and locate the learner.",
      "Edit the student record and choose the new class.",
      "Save the record and confirm the new class assignment.",
    ],
    path: "/admin/students",
    actionLabel: "Open Students",
    relatedIds: ["edit-student", "add-student", "student-history"],
    contexts: ["/admin/students"],
  },
  {
    id: "student-history",
    question: "Where can I view a student's history?",
    shortLabel: "View student history",
    keywords: ["student history", "past student", "student record", "learner history"],
    steps: [
      "Open Student History from the left menu.",
      "Search for the learner by name or identifier.",
      "Open the record to review previous school activity and changes.",
    ],
    path: "/admin/student-history",
    actionLabel: "Open Student History",
    relatedIds: ["edit-student", "add-student", "attendance-report"],
    contexts: ["/admin/student-history", "/admin/students"],
  },
  {
    id: "add-teacher",
    question: "How do I add a new teacher?",
    shortLabel: "Add a teacher",
    keywords: ["add teacher", "new teacher", "register teacher", "create teacher", "add staff"],
    steps: [
      "Open Teachers from the left menu.",
      "Select Add Teacher and enter the teacher’s contact and assignment details.",
      "Save the profile. The teacher will receive the configured account instructions.",
    ],
    path: "/admin/teachers",
    actionLabel: "Open Teachers",
    relatedIds: ["assign-teacher", "teacher-login", "teacher-attendance"],
    contexts: ["/admin/teachers", "/admin"],
  },
  {
    id: "assign-teacher",
    question: "How do I assign a teacher to a class?",
    shortLabel: "Assign a teacher",
    keywords: ["assign teacher", "teacher class", "class teacher", "teacher subject"],
    steps: [
      "Open Teachers and select the teacher you want to update.",
      "Edit their class or subject assignments.",
      "Save the profile and ask the teacher to refresh their dashboard.",
    ],
    path: "/admin/teachers",
    actionLabel: "Open Teachers",
    relatedIds: ["add-teacher", "teacher-login", "timetable"],
    contexts: ["/admin/teachers"],
  },
  {
    id: "teacher-login",
    question: "What should I do when a teacher cannot sign in?",
    shortLabel: "Teacher login help",
    keywords: ["teacher login", "cannot sign in", "teacher password", "login problem", "reset teacher"],
    steps: [
      "Confirm the teacher’s email address in Teachers.",
      "Check that the teacher account is active and assigned to your school.",
      "Use the available account repair or password-reset option, then ask the teacher to sign in again.",
    ],
    path: "/admin/teachers",
    actionLabel: "Open Teachers",
    relatedIds: ["add-teacher", "assign-teacher", "settings"],
    contexts: ["/admin/teachers"],
  },
  {
    id: "record-attendance",
    question: "How do I record student attendance?",
    shortLabel: "Record attendance",
    keywords: ["record attendance", "take attendance", "mark present", "mark absent", "student attendance"],
    steps: [
      "Open Attendance from the left menu.",
      "Choose the class and date you want to record.",
      "Mark each learner’s status, then save the attendance register.",
    ],
    path: "/admin/attendance",
    actionLabel: "Open Attendance",
    relatedIds: ["attendance-report", "edit-attendance", "teacher-attendance"],
    contexts: ["/admin/attendance", "/admin"],
  },
  {
    id: "edit-attendance",
    question: "How do I correct an attendance record?",
    shortLabel: "Correct attendance",
    keywords: ["edit attendance", "correct attendance", "wrong attendance", "change absent"],
    steps: [
      "Open Attendance and select the original class and date.",
      "Find the learner whose status needs correction.",
      "Update the status and save the register again.",
    ],
    path: "/admin/attendance",
    actionLabel: "Open Attendance",
    relatedIds: ["record-attendance", "attendance-report", "teacher-attendance"],
    contexts: ["/admin/attendance"],
  },
  {
    id: "attendance-report",
    question: "Where can I view attendance reports?",
    shortLabel: "Attendance reports",
    keywords: ["attendance report", "attendance summary", "absent students", "attendance statistics"],
    steps: [
      "Open Attendance from the left menu.",
      "Use the class, date, or term filters to choose the period you need.",
      "Review the attendance totals and learner-level records shown on the page.",
    ],
    path: "/admin/attendance",
    actionLabel: "View Attendance",
    relatedIds: ["record-attendance", "edit-attendance", "academic-reports"],
    contexts: ["/admin/attendance", "/admin"],
  },
  {
    id: "teacher-attendance",
    question: "How can I check teacher attendance?",
    shortLabel: "Teacher attendance",
    keywords: ["teacher attendance", "staff attendance", "teacher present", "teacher absent"],
    steps: [
      "Open the teacher attendance area from your dashboard or activity tools.",
      "Select the date range you want to review.",
      "Check attendance totals and individual teacher records.",
    ],
    path: "/admin/teacher-attendance",
    actionLabel: "Open Teacher Attendance",
    relatedIds: ["attendance-report", "add-teacher", "activity"],
    contexts: ["/admin/teacher-attendance", "/admin/teachers"],
  },
  {
    id: "create-report-card",
    question: "How do I generate report cards?",
    shortLabel: "Generate report cards",
    keywords: ["report card", "generate report", "student report", "print report card"],
    steps: [
      "Open Report Cards from the left menu.",
      "Select the class, academic term, and students.",
      "Review the scores and remarks before generating or printing the report cards.",
    ],
    path: "/admin/report-card",
    actionLabel: "Open Report Cards",
    relatedIds: ["enter-scores", "teacher-remarks", "academic-reports"],
    contexts: ["/admin/report-card", "/admin/reports", "/admin"],
  },
  {
    id: "enter-scores",
    question: "How are assessment scores entered?",
    shortLabel: "Enter assessment scores",
    keywords: ["enter scores", "assessment scores", "exam marks", "student marks", "record grades"],
    steps: [
      "Teachers enter scores from their Assessment dashboard.",
      "Confirm the correct class, subject, assessment, and term are selected.",
      "School admins can review the resulting records in Academic Reports and Report Cards.",
    ],
    path: "/admin/reports",
    actionLabel: "Open Academic Reports",
    relatedIds: ["create-report-card", "teacher-remarks", "academic-reports"],
    contexts: ["/admin/reports", "/admin/report-card"],
  },
  {
    id: "teacher-remarks",
    question: "How are teacher remarks added to report cards?",
    shortLabel: "Teacher remarks",
    keywords: ["teacher remarks", "report remarks", "student comments", "remarks report card"],
    steps: [
      "Ask the class teacher to open Write Remarks from their dashboard.",
      "The teacher selects the term and enters remarks for each learner.",
      "Review the completed remarks when preparing report cards.",
    ],
    path: "/admin/report-card",
    actionLabel: "Open Report Cards",
    relatedIds: ["create-report-card", "enter-scores", "academic-reports"],
    contexts: ["/admin/report-card"],
  },
  {
    id: "academic-reports",
    question: "Where can I see academic performance reports?",
    shortLabel: "Academic performance",
    keywords: ["academic report", "performance report", "class performance", "student performance", "results"],
    steps: [
      "Open Academic Reports from the left menu.",
      "Choose the class, subject, term, or learner you want to analyse.",
      "Review the available performance summaries and detailed results.",
    ],
    path: "/admin/reports",
    actionLabel: "Open Academic Reports",
    relatedIds: ["create-report-card", "enter-scores", "attendance-report"],
    contexts: ["/admin/reports", "/admin"],
  },
  {
    id: "create-fee",
    question: "How do I set up school fees?",
    shortLabel: "Set up fees",
    keywords: ["set fees", "create fee", "school fees", "fee structure", "new bill"],
    steps: [
      "Open Fees & Payments from the left menu.",
      "Create or select the appropriate fee structure for the class and term.",
      "Enter the amount and applicable learners, then save the fee.",
    ],
    path: "/admin/fees",
    actionLabel: "Open Fees & Payments",
    relatedIds: ["record-payment", "unpaid-fees", "payment-settings"],
    contexts: ["/admin/fees"],
  },
  {
    id: "record-payment",
    question: "How do I record a fee payment?",
    shortLabel: "Record a payment",
    keywords: ["record payment", "fee payment", "student paid", "receive fees", "payment receipt"],
    steps: [
      "Open Fees & Payments and locate the learner or invoice.",
      "Choose the payment action and enter the amount and payment details.",
      "Confirm the transaction and provide the generated receipt where applicable.",
    ],
    path: "/admin/fees",
    actionLabel: "Open Fees & Payments",
    relatedIds: ["unpaid-fees", "create-fee", "payment-settings"],
    contexts: ["/admin/fees", "/admin"],
  },
  {
    id: "unpaid-fees",
    question: "Where can I see students with unpaid fees?",
    shortLabel: "Find unpaid fees",
    keywords: ["unpaid fees", "outstanding fees", "students owing", "fee balance", "debtors"],
    steps: [
      "Open Fees & Payments from the left menu.",
      "Use the outstanding or balance filters for the relevant class and term.",
      "Review the learner balances and open an invoice for more detail.",
    ],
    path: "/admin/fees",
    actionLabel: "Open Fees & Payments",
    relatedIds: ["fee-reminder", "record-payment", "create-fee"],
    contexts: ["/admin/fees", "/admin"],
  },
  {
    id: "fee-reminder",
    question: "How do I remind parents about unpaid fees?",
    shortLabel: "Send fee reminders",
    keywords: ["fee reminder", "remind parents", "unpaid reminder", "payment message", "sms fees"],
    steps: [
      "Open SMS Reminders from the left menu.",
      "Choose the appropriate recipients or outstanding-fee group.",
      "Review the message and recipient count carefully before sending.",
    ],
    path: "/admin/reminders",
    actionLabel: "Open SMS Reminders",
    relatedIds: ["unpaid-fees", "sms-reminder", "record-payment"],
    contexts: ["/admin/fees", "/admin/reminders"],
  },
  {
    id: "payment-settings",
    question: "Where do I configure online payments?",
    shortLabel: "Online payments",
    keywords: ["online payment", "payment settings", "paystack", "payment account", "configure payments"],
    steps: [
      "Open Online Payment from the left menu.",
      "Review the available payment configuration and settlement information.",
      "Save changes only after confirming the details belong to your school.",
    ],
    path: "/admin/payment-settings",
    actionLabel: "Open Online Payment",
    relatedIds: ["record-payment", "create-fee", "billing"],
    contexts: ["/admin/payment-settings", "/admin/fees"],
  },
  {
    id: "sms-reminder",
    question: "How do I send an SMS reminder?",
    shortLabel: "Send an SMS",
    keywords: ["send sms", "sms reminder", "text parents", "message parents", "broadcast message"],
    steps: [
      "Open SMS Reminders from the left menu.",
      "Select the recipient group and write your message.",
      "Check the recipient count and SMS cost before confirming the send.",
    ],
    path: "/admin/reminders",
    actionLabel: "Open SMS Reminders",
    relatedIds: ["fee-reminder", "parent-contact", "activity"],
    contexts: ["/admin/reminders", "/admin"],
  },
  {
    id: "parent-contact",
    question: "Where do I update a parent's contact details?",
    shortLabel: "Parent contact details",
    keywords: ["parent contact", "parent phone", "guardian details", "change parent number"],
    steps: [
      "Open Students and find the learner connected to the parent.",
      "Edit the student record and update the parent or guardian section.",
      "Save the record and verify the new contact information.",
    ],
    path: "/admin/students",
    actionLabel: "Open Students",
    relatedIds: ["edit-student", "sms-reminder", "add-student"],
    contexts: ["/admin/students", "/admin/reminders"],
  },
  {
    id: "timetable",
    question: "How do I create or update the timetable?",
    shortLabel: "Manage timetable",
    keywords: ["timetable", "class schedule", "lesson schedule", "school timetable"],
    steps: [
      "Open Timetable from the left menu.",
      "Choose the class and timetable period you want to manage.",
      "Add or update lessons, teachers, subjects, and times, then save.",
    ],
    path: "/admin/timetable",
    actionLabel: "Open Timetable",
    relatedIds: ["assign-teacher", "settings", "academic-reports"],
    contexts: ["/admin/timetable", "/admin"],
  },
  {
    id: "payroll",
    question: "Where can I manage staff payroll?",
    shortLabel: "Manage payroll",
    keywords: ["payroll", "staff salary", "teacher salary", "pay staff"],
    steps: [
      "Open Staff Payroll from the left menu.",
      "Review staff payment profiles and prepare the relevant payroll run.",
      "Verify every amount before approving or recording payments.",
    ],
    path: "/admin/payroll",
    actionLabel: "Open Staff Payroll",
    relatedIds: ["add-teacher", "payment-settings", "activity"],
    contexts: ["/admin/payroll"],
  },
  {
    id: "activity",
    question: "Where can I review activity in my school account?",
    shortLabel: "Review activity",
    keywords: ["activity log", "school activity", "who changed", "recent activity", "audit"],
    steps: [
      "Open Activity from the left menu.",
      "Use the available filters to narrow by user, action, or date.",
      "Open an entry to review its recorded details.",
    ],
    path: "/admin/activity",
    actionLabel: "Open Activity",
    relatedIds: ["teacher-attendance", "backups", "settings"],
    contexts: ["/admin/activity", "/admin"],
  },
  {
    id: "backups",
    question: "How do I manage school backups?",
    shortLabel: "Manage backups",
    keywords: ["backup", "restore data", "download backup", "school data backup"],
    steps: [
      "Open Backups from the left menu.",
      "Review the available backup records and their dates.",
      "Use restore or download actions carefully and confirm the selected backup first.",
    ],
    path: "/admin/backups",
    actionLabel: "Open Backups",
    relatedIds: ["activity", "settings", "billing"],
    contexts: ["/admin/backups"],
  },
  {
    id: "settings",
    question: "Where can I change school settings?",
    shortLabel: "School settings",
    keywords: ["school settings", "academic year", "term settings", "school profile", "change logo"],
    steps: [
      "Open Settings from the left menu.",
      "Choose the section you need, such as school profile or academic year.",
      "Review the changes and save them before leaving the page.",
    ],
    path: "/admin/settings",
    actionLabel: "Open Settings",
    relatedIds: ["billing", "timetable", "backups"],
    contexts: ["/admin/settings", "/admin"],
  },
  {
    id: "billing",
    question: "Where can I see my subscription and billing status?",
    shortLabel: "Subscription status",
    keywords: ["subscription", "billing", "renew plan", "plan status", "expiry"],
    steps: [
      "Open Billing from the left menu.",
      "Review your current plan, renewal status, and available billing information.",
      "Use the renewal option if your subscription requires attention.",
    ],
    path: "/admin/billing",
    actionLabel: "Open Billing",
    relatedIds: ["payment-settings", "settings", "backups"],
    contexts: ["/admin/billing", "/admin"],
  },
  {
    id: "features",
    question: "Why is a feature missing from my dashboard?",
    shortLabel: "Missing features",
    keywords: ["feature missing", "cannot see", "menu missing", "not available", "locked feature"],
    steps: [
      "Check your school’s current subscription in Billing.",
      "Some menu items appear only when the feature is included in the active plan.",
      "If the feature should be available, refresh the page and contact support with the feature name.",
    ],
    path: "/admin/billing",
    actionLabel: "Check Billing",
    relatedIds: ["billing", "settings", "support"],
    contexts: ["/admin/billing", "/admin"],
  },
  {
    id: "support",
    question: "How do I get help when something is not working?",
    shortLabel: "Get support",
    keywords: ["help", "support", "not working", "problem", "error", "contact"],
    steps: [
      "Note the page you were using and the action that failed.",
      "Capture the exact error message or a screenshot without exposing passwords.",
      "Send those details to School Manager GH support so the issue can be investigated.",
    ],
    relatedIds: ["features", "teacher-login", "settings"],
    contexts: ["/admin"],
  },
];

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "can", "do", "for", "how", "i", "in", "is",
  "my", "of", "on", "the", "to", "what", "where", "with",
]);

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (value: string) =>
  normalize(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

export const findAssistantTopic = (query: string) => {
  const normalizedQuery = normalize(query);
  const queryTokens = tokenize(query);
  if (!normalizedQuery || queryTokens.length === 0) return null;

  let best: { topic: SchoolAssistantTopic; score: number } | null = null;

  for (const topic of SCHOOL_ASSISTANT_TOPICS) {
    const phrases = [topic.question, topic.shortLabel, ...topic.keywords].map(normalize);
    let score = 0;

    for (const phrase of phrases) {
      if (normalizedQuery.includes(phrase) || phrase.includes(normalizedQuery)) {
        score += phrase === normalizedQuery ? 18 : 10;
      }
    }

    const topicTokens = new Set(tokenize(phrases.join(" ")));
    for (const token of queryTokens) {
      if (topicTokens.has(token)) score += 3;
      else if ([...topicTokens].some((candidate) => candidate.startsWith(token) || token.startsWith(candidate))) {
        score += 1;
      }
    }

    if (!best || score > best.score) best = { topic, score };
  }

  return best && best.score >= 5 ? best.topic : null;
};

export const getAssistantTopic = (id: string) =>
  SCHOOL_ASSISTANT_TOPICS.find((topic) => topic.id === id) || null;

export const getContextSuggestions = (pathname: string, limit = 3) => {
  const contextual = SCHOOL_ASSISTANT_TOPICS.filter((topic) =>
    topic.contexts.some((context) =>
      context === "/admin" ? pathname === "/admin" : pathname.startsWith(context),
    ),
  );
  const fallbackIds = ["add-student", "record-attendance", "unpaid-fees"];
  const combined = [
    ...contextual,
    ...fallbackIds
      .map(getAssistantTopic)
      .filter((topic): topic is SchoolAssistantTopic => Boolean(topic)),
  ];

  return combined
    .filter((topic, index, all) => all.findIndex((item) => item.id === topic.id) === index)
    .slice(0, limit);
};

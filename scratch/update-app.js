const fs = require('fs');
const path = 'e:\\School Manager GH\\school-manager\\App.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add Import
content = content.replace(
  'import StudentPerformance from "./pages/teacher/StudentPerformance";\r\nimport Schools from "./pages/super-admin/Schools";',
  'import StudentPerformance from "./pages/teacher/StudentPerformance";\r\nimport ParentDashboard from "./pages/parent/ParentDashboard";\r\nimport Schools from "./pages/super-admin/Schools";'
);
content = content.replace(
  'import StudentPerformance from "./pages/teacher/StudentPerformance";\nimport Schools from "./pages/super-admin/Schools";',
  'import StudentPerformance from "./pages/teacher/StudentPerformance";\nimport ParentDashboard from "./pages/parent/ParentDashboard";\nimport Schools from "./pages/super-admin/Schools";'
);

// 2. Redirect Path
content = content.replace(
  '        : user.role === UserRole.SCHOOL_ADMIN\n          ? "/admin/students" // Use a specific admin route instead of root\n          : "/teacher";',
  '        : user.role === UserRole.SCHOOL_ADMIN\n          ? "/admin/students" // Use a specific admin route instead of root\n          : user.role === UserRole.PARENT\n            ? "/parent"\n            : "/teacher";'
);
content = content.replace(
  '        : user.role === UserRole.SCHOOL_ADMIN\r\n          ? "/admin/students" // Use a specific admin route instead of root\r\n          : "/teacher";',
  '        : user.role === UserRole.SCHOOL_ADMIN\r\n          ? "/admin/students" // Use a specific admin route instead of root\r\n          : user.role === UserRole.PARENT\r\n            ? "/parent"\r\n            : "/teacher";'
);

// 3. Fallback Path
content = content.replace(
  '      user?.role === UserRole.TEACHER ? "/teacher" : "/admin/students";',
  '      user?.role === UserRole.TEACHER ? "/teacher" : user?.role === UserRole.PARENT ? "/parent" : "/admin/students";'
);

// 4. RoleBasedHome
content = content.replace(
  '  if (user?.role === UserRole.TEACHER) return <TeacherDashboard />;\n  return <Navigate to="/login" />;',
  '  if (user?.role === UserRole.TEACHER) return <TeacherDashboard />;\n  if (user?.role === UserRole.PARENT) return <ParentDashboard />;\n  return <Navigate to="/login" />;'
);
content = content.replace(
  '  if (user?.role === UserRole.TEACHER) return <TeacherDashboard />;\r\n  return <Navigate to="/login" />;',
  '  if (user?.role === UserRole.TEACHER) return <TeacherDashboard />;\r\n  if (user?.role === UserRole.PARENT) return <ParentDashboard />;\r\n  return <Navigate to="/login" />;'
);

// 5. Routes
content = content.replace(
  '      <Route\n        path="/teacher/student-performance"\n        element={\n          <ProtectedRoute\n            allowedRoles={[UserRole.TEACHER]}\n            requiredFeature="basic_exam_reports"\n          >\n            <StudentPerformance />\n          </ProtectedRoute>\n        }\n      />\n    </Routes>',
  '      <Route\n        path="/teacher/student-performance"\n        element={\n          <ProtectedRoute\n            allowedRoles={[UserRole.TEACHER]}\n            requiredFeature="basic_exam_reports"\n          >\n            <StudentPerformance />\n          </ProtectedRoute>\n        }\n      />\n\n      {/* Parent Routes */}\n      <Route\n        path="/parent"\n        element={\n          <ProtectedRoute allowedRoles={[UserRole.PARENT]}>\n            <ParentDashboard />\n          </ProtectedRoute>\n        }\n      />\n    </Routes>'
);
content = content.replace(
  '      <Route\r\n        path="/teacher/student-performance"\r\n        element={\r\n          <ProtectedRoute\r\n            allowedRoles={[UserRole.TEACHER]}\r\n            requiredFeature="basic_exam_reports"\r\n          >\r\n            <StudentPerformance />\r\n          </ProtectedRoute>\r\n        }\r\n      />\r\n    </Routes>',
  '      <Route\r\n        path="/teacher/student-performance"\r\n        element={\r\n          <ProtectedRoute\r\n            allowedRoles={[UserRole.TEACHER]}\r\n            requiredFeature="basic_exam_reports"\r\n          >\r\n            <StudentPerformance />\r\n          </ProtectedRoute>\r\n        }\r\n      />\r\n\r\n      {/* Parent Routes */}\r\n      <Route\r\n        path="/parent"\r\n        element={\r\n          <ProtectedRoute allowedRoles={[UserRole.PARENT]}>\r\n            <ParentDashboard />\r\n          </ProtectedRoute>\r\n        }\r\n      />\r\n    </Routes>'
);

fs.writeFileSync(path, content);
console.log("Updated App.tsx successfully.");
